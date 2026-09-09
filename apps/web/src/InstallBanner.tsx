import { useEffect, useState } from "react";

interface InstallEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}
const key = "folio.install-invitation";
function remembered() { try { return !!localStorage.getItem(key); } catch { return false; } }
function remember(value: string) { try { localStorage.setItem(key, value); } catch { /* Session state still dismisses the banner. */ } }
function standalone() {
  return matchMedia("(display-mode: standalone)").matches || (navigator as Navigator & { standalone?: boolean }).standalone === true;
}
export function InstallBanner() {
  const [hidden, setHidden] = useState(() => remembered() || standalone());
  const [event, setEvent] = useState<InstallEvent | null>(null);
  const [instructions, setInstructions] = useState(false);
  const [busy, setBusy] = useState(false);
  const ua = navigator.userAgent;
  const apple = /iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1);
  const android = /Android/.test(ua);
  const mobile = apple || android;
  const manual = apple ? "In Safari, open Share, then Add to Home Screen. Enable Open as Web App if shown, then tap Add."
    : android && /Chrome|Firefox|SamsungBrowser|EdgA/.test(ua) && !/; wv\)|FBAN|Instagram/.test(ua)
      ? "Open your browser menu and choose Install app or Add to Home screen, then follow the instructions." : "";
  useEffect(() => {
    const installed = () => { remember("installed"); setHidden(true); setEvent(null); };
    const ready = (e: Event) => { if (!mobile) return; e.preventDefault(); setEvent(e as InstallEvent); };
    const mode = matchMedia("(display-mode: standalone)");
    const changed = () => { if (standalone()) installed(); };
    window.addEventListener("beforeinstallprompt", ready);
    window.addEventListener("appinstalled", installed);
    mode.addEventListener("change", changed);
    return () => { window.removeEventListener("beforeinstallprompt", ready); window.removeEventListener("appinstalled", installed); mode.removeEventListener("change", changed); };
  }, [mobile]);
  if (hidden || !mobile || (!event && !manual) || !window.isSecureContext) return null;
  return <aside className="install-banner" aria-label="Install Folio">
    <span>{instructions ? manual : "Install Folio on your home screen for easier access."}</span>
    {!instructions && <button disabled={busy} onClick={async () => {
      if (!event) { setInstructions(true); return; }
      setBusy(true);
      try {
        await event.prompt();
        const choice = await event.userChoice;
        remember(choice.outcome); setHidden(true);
      } catch { setInstructions(true); }
      finally { setEvent(null); setBusy(false); }
    }}>{event ? "Install" : "How to install"}</button>}
    <button onClick={() => { remember("dismissed"); setHidden(true); }}>Not now</button>
  </aside>;
}
