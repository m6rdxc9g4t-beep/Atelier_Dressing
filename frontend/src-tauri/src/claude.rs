//! Appel de Claude par la CLI Claude Code du Mac : ton abonnement Claude, pas de clé API.
//!
//! Contrat commun de la suite Atelier (Atelier_Tab, docs/SUITE.md §5.3), comme Tab, Viz et Nexus :
//! - `claude -p --safe-mode --tools "" --strict-mcp-config --disable-slash-commands
//!   --no-session-persistence --max-turns 2 --model <alias> --system-prompt <consignes>
//!   --json-schema <schéma>` ; entrée et sortie en `stream-json` (les photos passent en blocs image) ;
//! - aucune donnée en argument (visible par `ps`) : le prompt système ne contient que des consignes,
//!   la photo et les données passent par l'entrée standard ;
//! - environnement en liste blanche, dossier de travail temporaire vide, délai de 180 s
//!   (arrêt forcé ensuite), sorties lues avec une taille maximale ;
//! - jamais d'outil de la CLI (ni shell, ni fichiers, ni MCP).
//!
//! Module sans dépendance à Tauri : testé à part avec une fausse CLI (voir `tests` en bas).

use std::collections::HashMap;
use std::io::{Read, Write};
use std::path::{Path, PathBuf};
use std::process::{Command, Stdio};
use std::sync::atomic::{AtomicU64, Ordering};
use std::thread;
use std::time::{Duration, Instant};

pub const DELAI: Duration = Duration::from_secs(180);
const DELAI_STATUT: Duration = Duration::from_secs(15);
const SORTIE_MAX: usize = 8 * 1024 * 1024;
const ENTREE_MAX: usize = 12 * 1024 * 1024;
const CONSIGNES_MAX: usize = 64_000;
const SCHEMA_MAX: usize = 64_000;
pub const MODELES: [&str; 3] = ["sonnet", "opus", "haiku"];

pub const INTROUVABLE: &str = "CLI « claude » introuvable sur ce Mac : installe Claude Code, puis lance « claude auth login » dans le Terminal.";

static COMPTEUR: AtomicU64 = AtomicU64::new(0);

/// Variables d'environnement transmises à la CLI (liste blanche du contrat), plus `LC_*`.
const ENV_AUTORISEES: [&str; 10] = ["HOME", "USER", "LOGNAME", "PATH", "SHELL", "LANG", "TMPDIR", "TZ", "CLAUDE_CONFIG_DIR", "CLAUDE_CLI"];

/// Une demande venue de l'interface : consignes, schéma JSON de la réponse, entrée stream-json, modèle.
#[derive(Debug, Clone)]
pub struct Demande {
    pub consignes: String,
    pub schema: String,
    pub entree: String,
    pub modele: String,
}

#[derive(Debug, Clone, PartialEq)]
pub struct Statut {
    pub disponible: bool,
    pub connecte: bool,
    pub version: Option<String>,
    pub message: String,
}

fn executable(p: &Path) -> bool {
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        p.is_file() && p.metadata().map(|m| m.permissions().mode() & 0o111 != 0).unwrap_or(false)
    }
    #[cfg(not(unix))]
    {
        p.is_file()
    }
}

/// `CLAUDE_CLI` (chemin absolu), sinon le `PATH` (entrées relatives et `node_modules/.bin` ignorées),
/// puis `~/.local/bin`, `/opt/homebrew/bin`, `/usr/local/bin` : une app ouverte depuis le Finder
/// n'hérite pas du `PATH` du Terminal.
pub fn trouver_claude(env: &HashMap<String, String>) -> Option<PathBuf> {
    if let Some(explicite) = env.get("CLAUDE_CLI").map(|s| s.trim()).filter(|s| !s.is_empty()) {
        let p = PathBuf::from(explicite);
        return if p.is_absolute() && executable(&p) { Some(p) } else { None };
    }
    let mut dossiers: Vec<PathBuf> = env
        .get("PATH")
        .map(|v| std::env::split_paths(v).collect())
        .unwrap_or_default();
    dossiers.retain(|d| d.is_absolute() && !d.to_string_lossy().contains("node_modules/.bin"));
    if let Some(home) = env.get("HOME") {
        dossiers.push(Path::new(home).join(".local/bin"));
    }
    dossiers.push(PathBuf::from("/opt/homebrew/bin"));
    dossiers.push(PathBuf::from("/usr/local/bin"));
    dossiers.into_iter().map(|d| d.join("claude")).find(|f| executable(f))
}

/// Environnement isolé : liste blanche, dossier de l'exécutable en tête du PATH (une CLI installée
/// par npm doit trouver `node`), trafic non essentiel coupé.
pub fn environnement(env: &HashMap<String, String>, exe: &Path) -> HashMap<String, String> {
    let mut out: HashMap<String, String> = env
        .iter()
        .filter(|(k, _)| (ENV_AUTORISEES.contains(&k.as_str()) && k.as_str() != "CLAUDE_CLI") || k.starts_with("LC_"))
        .map(|(k, v)| (k.clone(), v.clone()))
        .collect();
    let mut chemins: Vec<PathBuf> = Vec::new();
    if let Some(dir) = exe.parent() {
        chemins.push(dir.to_path_buf());
    }
    for d in out.get("PATH").map(|v| std::env::split_paths(v).collect::<Vec<_>>()).unwrap_or_default() {
        if !chemins.contains(&d) {
            chemins.push(d);
        }
    }
    for d in ["/opt/homebrew/bin", "/usr/local/bin", "/usr/bin", "/bin"] {
        let d = PathBuf::from(d);
        if !chemins.contains(&d) {
            chemins.push(d);
        }
    }
    if let Ok(p) = std::env::join_paths(chemins) {
        out.insert("PATH".into(), p.to_string_lossy().into_owned());
    }
    out.insert("CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC".into(), "1".into());
    out
}

/// Arguments de `claude` : exactement ceux du contrat, en stream-json pour porter les photos.
pub fn arguments(d: &Demande) -> Vec<String> {
    [
        "-p",
        "--safe-mode",
        "--output-format",
        "stream-json",
        "--verbose",
        "--input-format",
        "stream-json",
        "--tools",
        "",
        "--strict-mcp-config",
        "--disable-slash-commands",
        "--no-session-persistence",
        // La sortie structurée demande un tour de plus (outil interne de la CLI)
        "--max-turns",
        "2",
        "--model",
        &d.modele,
        "--system-prompt",
        &d.consignes,
        "--json-schema",
        &d.schema,
    ]
    .iter()
    .map(|s| s.to_string())
    .collect()
}

pub fn valider(d: &Demande) -> Result<(), String> {
    if !MODELES.contains(&d.modele.as_str()) {
        return Err(format!("Modèle inconnu : {}", d.modele));
    }
    if d.consignes.len() > CONSIGNES_MAX || d.schema.len() > SCHEMA_MAX || d.entree.len() > ENTREE_MAX {
        return Err("Demande trop volumineuse pour Claude.".into());
    }
    serde_json::from_str::<serde_json::Value>(&d.schema).map_err(|_| "Schéma JSON invalide.".to_string())?;
    Ok(())
}

fn lire_borne<R: Read + Send + 'static>(mut r: R) -> thread::JoinHandle<Vec<u8>> {
    thread::spawn(move || {
        let mut tout = Vec::new();
        let mut bloc = [0u8; 64 * 1024];
        loop {
            match r.read(&mut bloc) {
                Ok(0) | Err(_) => break,
                Ok(n) => {
                    if tout.len() < SORTIE_MAX {
                        let reste = SORTIE_MAX - tout.len();
                        tout.extend_from_slice(&bloc[..n.min(reste)]);
                    }
                }
            }
        }
        tout
    })
}

/// Lance la CLI et renvoie (code, sortie, erreurs), avec délai et arrêt forcé.
pub fn executer(exe: &Path, args: &[String], entree: Option<&str>, env: &HashMap<String, String>, delai: Duration) -> Result<(i32, String, String), String> {
    let n = COMPTEUR.fetch_add(1, Ordering::Relaxed);
    let dossier = std::env::temp_dir().join(format!("atelier-dressing-claude-{}-{}", std::process::id(), n));
    std::fs::create_dir_all(&dossier).map_err(|e| format!("Dossier temporaire impossible : {e}"))?;
    let resultat = (|| {
        let mut enfant = Command::new(exe)
            .args(args)
            .env_clear()
            .envs(env)
            .current_dir(&dossier)
            .stdin(if entree.is_some() { Stdio::piped() } else { Stdio::null() })
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            .spawn()
            .map_err(|e| format!("Impossible de lancer Claude Code : {e}"))?;
        if let (Some(texte), Some(mut stdin)) = (entree, enfant.stdin.take()) {
            let octets = texte.as_bytes().to_vec();
            thread::spawn(move || {
                let _ = stdin.write_all(&octets);
            });
        }
        let sortie = lire_borne(enfant.stdout.take().expect("stdout"));
        let erreurs = lire_borne(enfant.stderr.take().expect("stderr"));
        let debut = Instant::now();
        let code = loop {
            match enfant.try_wait() {
                Ok(Some(s)) => break s.code().unwrap_or(-1),
                Ok(None) if debut.elapsed() >= delai => {
                    let _ = enfant.kill();
                    let _ = enfant.wait();
                    return Err(format!("Claude n'a pas répondu en {} s.", delai.as_secs()));
                }
                Ok(None) => thread::sleep(Duration::from_millis(50)),
                Err(e) => return Err(format!("Claude Code : {e}")),
            }
        };
        let sortie = String::from_utf8_lossy(&sortie.join().unwrap_or_default()).into_owned();
        let erreurs = String::from_utf8_lossy(&erreurs.join().unwrap_or_default()).into_owned();
        Ok((code, sortie, erreurs))
    })();
    let _ = std::fs::remove_dir_all(&dossier);
    resultat
}

/// Pose la question à Claude. Renvoie la sortie brute (stream-json) : l'interface en extrait la réponse.
pub fn demander(d: &Demande, env_systeme: &HashMap<String, String>) -> Result<String, String> {
    valider(d)?;
    let exe = trouver_claude(env_systeme).ok_or_else(|| INTROUVABLE.to_string())?;
    let env = environnement(env_systeme, &exe);
    let (code, sortie, erreurs) = executer(&exe, &arguments(d), Some(&d.entree), &env, DELAI)?;
    if sortie.trim().is_empty() {
        let detail: String = erreurs.trim().chars().take(400).collect();
        return Err(if detail.is_empty() { format!("Claude Code s'est arrêté (code {code}).") } else { detail });
    }
    Ok(sortie)
}

/// CLI trouvée, version, et connexion à un compte (`claude auth status`).
pub fn statut(env_systeme: &HashMap<String, String>) -> Statut {
    let Some(exe) = trouver_claude(env_systeme) else {
        return Statut { disponible: false, connecte: false, version: None, message: INTROUVABLE.into() };
    };
    let env = environnement(env_systeme, &exe);
    let version = executer(&exe, &["--version".into()], None, &env, DELAI_STATUT)
        .ok()
        .map(|(_, s, _)| s.trim().to_string())
        .filter(|s| !s.is_empty());
    let connecte = match executer(&exe, &["auth".into(), "status".into()], None, &env, DELAI_STATUT) {
        Ok((code, sortie, _)) => match serde_json::from_str::<serde_json::Value>(sortie.trim()) {
            Ok(v) => v.get("loggedIn").and_then(|b| b.as_bool()).unwrap_or(code == 0),
            Err(_) => code == 0,
        },
        Err(_) => false,
    };
    Statut {
        disponible: connecte,
        connecte,
        message: if connecte {
            "Claude Code est prêt (ton abonnement Claude).".into()
        } else {
            "Claude Code n'est connecté à aucun compte : lance « claude auth login » dans le Terminal.".into()
        },
        version,
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;

    fn fausse_cli(script: &str) -> (PathBuf, HashMap<String, String>) {
        let n = COMPTEUR.fetch_add(1, Ordering::Relaxed);
        let dir = std::env::temp_dir().join(format!("fausse-claude-{}-{}", std::process::id(), n));
        fs::create_dir_all(&dir).unwrap();
        let exe = dir.join("claude");
        fs::write(&exe, script).unwrap();
        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;
            fs::set_permissions(&exe, fs::Permissions::from_mode(0o755)).unwrap();
        }
        let mut env = HashMap::new();
        env.insert("PATH".into(), format!("{}:/usr/bin:/bin", dir.display()));
        env.insert("HOME".into(), "/nulle-part".into());
        env.insert("ANTHROPIC_API_KEY".into(), "secret".into());
        env.insert("LC_ALL".into(), "fr_FR.UTF-8".into());
        (exe, env)
    }

    fn demande() -> Demande {
        Demande { consignes: "Réponds en JSON.".into(), schema: "{\"type\":\"object\"}".into(), entree: "{\"type\":\"user\"}\n".into(), modele: "sonnet".into() }
    }

    #[test]
    fn trouve_la_cli_dans_le_path() {
        let (exe, env) = fausse_cli("#!/bin/sh\necho ok\n");
        assert_eq!(trouver_claude(&env), Some(exe));
        let mut sans = env.clone();
        sans.insert("CLAUDE_CLI".into(), "relatif/claude".into());
        assert_eq!(trouver_claude(&sans), None);
    }

    #[test]
    fn environnement_en_liste_blanche() {
        let (exe, env) = fausse_cli("#!/bin/sh\n");
        let e = environnement(&env, &exe);
        assert!(!e.contains_key("ANTHROPIC_API_KEY"));
        assert_eq!(e.get("LC_ALL").map(String::as_str), Some("fr_FR.UTF-8"));
        assert_eq!(e.get("CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC").map(String::as_str), Some("1"));
        assert!(e["PATH"].starts_with(&exe.parent().unwrap().display().to_string()));
    }

    #[test]
    fn arguments_du_contrat_sans_donnees() {
        let a = arguments(&demande());
        for attendu in ["-p", "--safe-mode", "--strict-mcp-config", "--disable-slash-commands", "--no-session-persistence"] {
            assert!(a.contains(&attendu.to_string()), "{attendu}");
        }
        let i = a.iter().position(|x| x == "--tools").unwrap();
        assert_eq!(a[i + 1], "");
        assert!(!a.iter().any(|x| x.contains("\"type\":\"user\"")), "l'entrée ne passe jamais en argument");
    }

    #[test]
    fn refuse_un_modele_inconnu_ou_un_schema_invalide() {
        let mut d = demande();
        d.modele = "rm -rf".into();
        assert!(valider(&d).is_err());
        let mut d = demande();
        d.schema = "pas du json".into();
        assert!(valider(&d).is_err());
        assert!(valider(&demande()).is_ok());
    }

    #[test]
    fn lit_l_entree_et_renvoie_la_sortie() {
        // La fausse CLI recopie l'entrée standard et vérifie l'isolement
        let (_, env) = fausse_cli("#!/bin/sh\n[ -z \"$ANTHROPIC_API_KEY\" ] || exit 9\ncat\necho '{\"type\":\"result\",\"structured_output\":{\"ok\":true}}'\n");
        let s = demander(&demande(), &env).unwrap();
        assert!(s.contains("{\"type\":\"user\"}"));
        assert!(s.contains("structured_output"));
    }

    #[test]
    fn arrete_une_cli_trop_lente() {
        let (exe, env) = fausse_cli("#!/bin/sh\nsleep 5\n");
        let e = executer(&exe, &[], None, &environnement(&env, &exe), Duration::from_millis(300));
        assert!(e.unwrap_err().contains("n'a pas répondu"));
    }

    #[test]
    fn statut_connecte_ou_non() {
        let (_, env) = fausse_cli("#!/bin/sh\nif [ \"$1\" = \"--version\" ]; then echo '2.5.0 (Claude Code)'; else echo '{\"loggedIn\": true}'; fi\n");
        let s = statut(&env);
        assert!(s.connecte);
        assert_eq!(s.version.as_deref(), Some("2.5.0 (Claude Code)"));
        let (_, env) = fausse_cli("#!/bin/sh\nif [ \"$1\" = \"--version\" ]; then echo 1; else echo '{\"loggedIn\": false}'; exit 1; fi\n");
        assert!(!statut(&env).connecte);
    }
}
