import { useEffect, useRef, type ReactNode } from "react";
import { publicPagePath, track } from "./analytics";

const impressions = new Set<string>();
export function PortfolioLink({ href, children }: { href: string; children: ReactNode }) {
  const ref = useRef<HTMLAnchorElement>(null);
  useEffect(() => {
    const element = ref.current;
    if (!element || !("IntersectionObserver" in window)) return;
    const key = `${publicPagePath()}:footer:owner_portfolio`;
    let timer = 0;
    const stop = () => { if (timer) window.clearTimeout(timer); timer = 0; };
    const observer = new IntersectionObserver(([entry]) => {
      stop();
      if (entry?.intersectionRatio >= .5 && document.visibilityState === "visible" && !impressions.has(key)) {
        timer = window.setTimeout(() => {
          if (document.visibilityState === "visible" && !impressions.has(key)) {
            impressions.add(key);
            track({ event: "portfolio_link_impression", link_id: "owner_portfolio", link_placement: "footer" });
          }
        }, 1000);
      }
    }, { threshold: [.5] });
    const visibility = () => { if (document.visibilityState !== "visible") stop(); };
    observer.observe(element); document.addEventListener("visibilitychange", visibility);
    return () => { stop(); observer.disconnect(); document.removeEventListener("visibilitychange", visibility); };
  }, []);
  return <a ref={ref} href={href} target="_blank" rel="noreferrer" onClick={() => track({ event: "portfolio_link_click", link_id: "owner_portfolio", link_placement: "footer" })}>{children}</a>;
}
