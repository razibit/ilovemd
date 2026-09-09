import { useState } from "react";

const GITHUB_URL = "https://github.com/razibit";

/**
 * Compact attribution card shown above the sidebar footer.
 * Dismisses on ×-click; links to GitHub in a new tab.
 */
export function CreatorAttribution() {
  const [dismissed, setDismissed] = useState(false);

  if (dismissed) return null;

  return (
    <div className="creator-attribution" role="region" aria-label="Creator attribution">
      <a
        className="creator-attribution-link"
        href={GITHUB_URL}
        target="_blank"
        rel="noopener noreferrer"
        aria-label="Made with love by the creator – visit GitHub profile"
      >
        <span className="creator-attribution-text">Made with ❤️ by</span>
        <img
          className="creator-avatar"
          src="/creator-avatar.png"
          alt="Creator profile photo"
          width={26}
          height={26}
        />
      </a>
      <button
        className="creator-attribution-dismiss"
        onClick={() => setDismissed(true)}
        aria-label="Dismiss creator attribution"
        type="button"
      >
        ×
      </button>
    </div>
  );
}
