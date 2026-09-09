/** Install opt-in embeds only in the interactive workspace, never in exports. */
export function prepareEmbeds(root: HTMLElement) {
  for (const node of root.querySelectorAll<HTMLElement>("[data-video-url]")) {
    if (node.dataset.embedPrepared) continue;
    node.dataset.embedPrepared = "true";
    const original = node.dataset.videoUrl!;
    let embed: string | undefined;
    try {
      const url = new URL(original);
      if (
        ["youtube.com", "www.youtube.com", "youtu.be"].includes(url.hostname)
      ) {
        const id =
          url.hostname === "youtu.be"
            ? url.pathname.slice(1)
            : url.searchParams.get("v");
        if (id && /^[\w-]{6,20}$/.test(id))
          embed = `https://www.youtube-nocookie.com/embed/${id}`;
      } else if (
        ["vimeo.com", "www.vimeo.com"].includes(url.hostname) &&
        /^\/\d+$/.test(url.pathname)
      )
        embed = `https://player.vimeo.com/video${url.pathname}`;
    } catch {}
    if (!embed) continue;
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = "Load external video";
    button.className = "secondary-button";
    button.title = "Contacts the video provider. Your document is not sent.";
    button.onclick = () => {
      const frame = document.createElement("iframe");
      frame.src = embed!;
      frame.title = node.querySelector("a")?.textContent || "Video player";
      frame.sandbox.add(
        "allow-scripts",
        "allow-same-origin",
        "allow-presentation",
      );
      frame.referrerPolicy = "no-referrer";
      frame.allow = "fullscreen";
      frame.className = "video-player";
      node.append(frame);
      button.remove();
    };
    node.append(document.createElement("br"), button);
  }
}
