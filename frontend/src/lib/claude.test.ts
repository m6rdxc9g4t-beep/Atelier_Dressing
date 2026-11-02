import { describe, expect, it } from "vitest";
import { entreeStreamJson, ErreurClaude, lireReponse, messageErreur } from "./claude";
import { migrerModeIA } from "./ia";

describe("Claude par la CLI (ton abonnement)", () => {
  it("met la photo et le texte dans un message stream-json, sur une ligne", () => {
    const l = entreeStreamJson("Voici la photo.", { media_type: "image/jpeg", data: "AAAA" });
    expect(l.endsWith("\n")).toBe(true);
    expect(l.trim().split("\n")).toHaveLength(1);
    const o = JSON.parse(l);
    expect(o.type).toBe("user");
    expect(o.message.content[0]).toEqual({ type: "image", source: { type: "base64", media_type: "image/jpeg", data: "AAAA" } });
    expect(o.message.content[1]).toEqual({ type: "text", text: "Voici la photo." });
  });

  it("lit la réponse structurée sur la dernière ligne « result »", () => {
    const sortie = [
      JSON.stringify({ type: "system", subtype: "init" }),
      JSON.stringify({ type: "assistant", message: {} }),
      JSON.stringify({ type: "result", is_error: false, structured_output: { nom: "Veste" } }),
    ].join("\n");
    expect(lireReponse(sortie)).toEqual({ nom: "Veste" });
  });

  it("accepte un JSON dans le texte du résultat (ancienne CLI)", () => {
    expect(lireReponse(JSON.stringify({ type: "result", result: '```json\n{"a":1}\n```' }))).toEqual({ a: 1 });
  });

  it("traduit les erreurs de la CLI", () => {
    expect(() => lireReponse(JSON.stringify({ type: "result", is_error: true, result: "Not logged in · Please run /login" }))).toThrow(ErreurClaude);
    expect(messageErreur("Not logged in")).toContain("claude auth login");
    expect(messageErreur("usage limit reached")).toContain("Limite de ton abonnement");
    expect(messageErreur("error: unknown option '--safe-mode'")).toContain("claude update");
  });

  it("reprend les anciens réglages du moteur", () => {
    expect(migrerModeIA("local")).toBe("ollama");
    expect(migrerModeIA("cloud")).toBe("claude");
    expect(migrerModeIA("n'importe quoi")).toBe("auto");
  });
});
