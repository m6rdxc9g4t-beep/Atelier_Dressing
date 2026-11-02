mod claude;

use serde::{Deserialize, Serialize};
use std::collections::HashMap;

#[derive(Deserialize)]
struct DemandeClaude {
  consignes: String,
  schema: String,
  entree: String,
  modele: String,
}

#[derive(Serialize)]
struct StatutClaude {
  disponible: bool,
  connecte: bool,
  version: Option<String>,
  message: String,
}

fn env_systeme() -> HashMap<String, String> {
  std::env::vars().collect()
}

/// Pose une question à Claude par la CLI Claude Code du Mac (abonnement de l'utilisateur).
#[tauri::command]
async fn claude_demander(demande: DemandeClaude) -> Result<String, String> {
  let d = claude::Demande {
    consignes: demande.consignes,
    schema: demande.schema,
    entree: demande.entree,
    modele: demande.modele,
  };
  tauri::async_runtime::spawn_blocking(move || claude::demander(&d, &env_systeme()))
    .await
    .map_err(|e| e.to_string())?
}

/// La CLI Claude Code est-elle installée et connectée à un compte ?
#[tauri::command]
async fn claude_statut() -> Result<StatutClaude, String> {
  let s = tauri::async_runtime::spawn_blocking(|| claude::statut(&env_systeme()))
    .await
    .map_err(|e| e.to_string())?;
  Ok(StatutClaude { disponible: s.disponible, connecte: s.connecte, version: s.version, message: s.message })
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
  tauri::Builder::default()
    .invoke_handler(tauri::generate_handler![claude_demander, claude_statut])
    .setup(|app| {
      if cfg!(debug_assertions) {
        app.handle().plugin(
          tauri_plugin_log::Builder::default()
            .level(log::LevelFilter::Info)
            .build(),
        )?;
      }
      Ok(())
    })
    .run(tauri::generate_context!())
    .expect("error while building tauri application");
}
