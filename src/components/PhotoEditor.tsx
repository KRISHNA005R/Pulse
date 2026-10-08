import { useEffect, useRef, useState } from "react";
import { useStore } from "../store/store";
import { useAuth } from "../store/auth";
import {
  dropGif,
  GIF_MAX_FILE,
  okGif,
  okPhoto,
  saveGif,
  squarePhoto,
  stillsOf,
} from "../lib/photo";
import type { LoopFrame, Timeline } from "../lib/gif";
import { looksLikeVideo, openVideo, videoFrames } from "../lib/videoLoop";
import { PersonAvatar } from "./ui/bits";
import { Icon } from "./ui/Icon";

// Profile photo: a photo, a GIF or a short video. A GIF or a video becomes a small moving loop of up
// to 5 seconds; when it is longer, the person slides to pick which 5 seconds.

const LOOP_MS = 5000;
/** Same numbers as lib/gif.ts, kept here so this screen doesn't load that file until it is needed. */
const MID = 128;

type Draft =
  | { kind: "gif"; tl: Timeline; ms: number; size: number }
  | { kind: "video"; url: string; ms: number; size: number };

const fileSize = (n: number) =>
  n >= 1e6
    ? `${(n / 1e6).toFixed(1)} MB`
    : `${Math.max(1, Math.round(n / 1024))} KB`;
const clock = (ms: number) => {
  const s = Math.round(ms / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
};
const tick = () => new Promise((r) => window.setTimeout(r, 40));

export function PhotoEditor() {
  const store = useStore();
  const { state } = store;
  const token = useAuth().session?.token;
  const input = useRef<HTMLInputElement>(null);
  const video = useRef<HTMLVideoElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const [busy, setBusy] = useState<
    "" | "photo" | "reading" | "making" | "saving"
  >("");
  const [draft, setDraft] = useState<Draft | null>(null);
  const [start, setStart] = useState(0);
  const has = okPhoto(state.user.photo);
  const hadGif = okGif(state.user.gif);
  const len = draft ? Math.min(LOOP_MS, draft.ms) : LOOP_MS;
  const slide = !!draft && draft.ms > LOOP_MS + 50;

  const clear = () => {
    const v = video.current;
    if (v) {
      v.pause();
      if (v.src) {
        URL.revokeObjectURL(v.src);
        v.removeAttribute("src");
        v.load();
      }
    }
    setDraft(null);
    setStart(0);
  };
  useEffect(() => clear, []); // eslint-disable-line react-hooks/exhaustive-deps

  // The preview: the picked part plays on a loop in the circle.
  useEffect(() => {
    const c = canvas.current?.getContext("2d");
    if (!draft || !c || busy) return;
    let stop = false;
    let timer = 0;
    let raf = 0;
    if (draft.kind === "gif") {
      void import("../lib/gif").then(({ windowOf }) => {
        const frames: LoopFrame[] = windowOf(draft.tl, start, len);
        let i = 0;
        const step = () => {
          if (stop || !frames.length) return;
          c.putImageData(
            new ImageData(new Uint8ClampedArray(frames[i].rgba), MID, MID),
            0,
            0,
          );
          timer = window.setTimeout(step, frames[i].delay);
          i = (i + 1) % frames.length;
        };
        step();
      });
    } else {
      const v = video.current;
      if (!v) return;
      const w = v.videoWidth;
      const h = v.videoHeight;
      const side = Math.min(w, h);
      v.currentTime = start / 1000;
      void v.play().catch(() => undefined);
      const draw = () => {
        if (stop) return;
        if (v.currentTime * 1000 >= start + len || v.ended) {
          v.currentTime = start / 1000;
          void v.play().catch(() => undefined);
        }
        c.drawImage(
          v,
          (w - side) / 2,
          (h - side) / 2,
          side,
          side,
          0,
          0,
          MID,
          MID,
        );
        raf = requestAnimationFrame(draw);
      };
      raf = requestAnimationFrame(draw);
    }
    return () => {
      stop = true;
      window.clearTimeout(timer);
      cancelAnimationFrame(raf);
      video.current?.pause();
    };
  }, [draft, start, len, busy]);

  /** A still picture becomes the photo. A GIF that was there before is let go. */
  const setStill = (made: { photo: string; face: string }, text?: string) => {
    store.updateUser({ ...made, gif: undefined });
    if (hadGif && token) void dropGif(token);
    store.toast({
      text: text ?? (has ? "Photo changed." : "Looking good. Photo added."),
      tone: "good",
      emoji: "📸",
    });
  };

  const choose = async (file: File | undefined) => {
    if (!file) return;
    clear();
    const oops = (
      text = "PULSE couldn't open that picture. Try another one, or a screenshot of it.",
    ) => store.toast({ text });
    let head = new Uint8Array();
    try {
      head = new Uint8Array(await file.slice(0, 4).arrayBuffer());
    } catch {
      /* read as a photo below */
    }
    const gif =
      head[0] === 0x47 &&
      head[1] === 0x49 &&
      head[2] === 0x46 &&
      head[3] === 0x38;
    if (gif) {
      if (file.size > GIF_MAX_FILE)
        return oops(
          `That GIF is ${fileSize(file.size)}. Pick one under 12 MB.`,
        );
      setBusy("reading");
      try {
        const [{ gifTimeline }, buffer] = await Promise.all([
          import("../lib/gif"),
          file.arrayBuffer(),
        ]);
        await tick();
        const tl = gifTimeline(buffer);
        if (!tl) oops("PULSE couldn't use that GIF. Try another one.");
        else if (tl.still) {
          const stills = stillsOf(tl.frames[0].rgba, MID);
          if (stills) setStill(stills);
          else oops();
        } else setDraft({ kind: "gif", tl, ms: tl.ms, size: file.size });
      } catch {
        oops();
      }
      return setBusy("");
    }
    if (looksLikeVideo(file)) {
      const v = video.current;
      if (!v) return;
      setBusy("reading");
      const opened = await openVideo(file, v);
      setBusy("");
      if (!opened)
        return oops("This phone can't play that video. Try another one.");
      return setDraft({
        kind: "video",
        url: opened.url,
        ms: opened.ms,
        size: file.size,
      });
    }
    setBusy("photo");
    const made = await squarePhoto(file);
    setBusy("");
    if (!made) return oops();
    setStill(made);
  };

  const use = async () => {
    if (!draft) return;
    setBusy("making");
    await tick();
    try {
      const lib = await import("../lib/gif");
      let frames: LoopFrame[] = [];
      let stills: { photo: string; face: string } | null = null;
      if (draft.kind === "gif") {
        frames = lib.windowOf(draft.tl, start, len);
        stills = frames[0] ? stillsOf(frames[0].rgba, MID) : null;
      } else if (video.current) {
        const got = await videoFrames(video.current, start, len);
        frames = got?.frames ?? [];
        stills = got?.stills ?? null;
      }
      await tick();
      const loop = lib.encodeLoop(frames);
      if (!loop || !stills) {
        setBusy("");
        return store.toast({
          text: "PULSE couldn't make that small enough. Try another part, or another one.",
        });
      }
      if (!token) {
        // Without an account there is nowhere to keep a moving photo: its first frame becomes the photo.
        setStill(stills, "Saved as a still photo. Sign in to make it move.");
        setBusy("");
        return clear();
      }
      setBusy("saving");
      const r = await saveGif(loop.bytes, token);
      setBusy("");
      if (!r.ok) return store.toast({ text: r.error });
      store.updateUser({ ...stills, gif: r.id });
      clear();
      store.toast({
        text: `${draft.kind === "video" ? "Video" : "GIF"} added. Your friends see it move too.`,
        tone: "good",
        emoji: "🎬",
      });
    } catch {
      setBusy("");
      store.toast({ text: "PULSE couldn't make that one. Try another." });
    }
  };

  const picker = (
    <input
      ref={input}
      id="profile-photo"
      type="file"
      accept="image/*,video/*"
      className="sr-only"
      tabIndex={-1}
      aria-label="Choose a photo, GIF or video"
      onChange={(e) => {
        const f = e.target.files?.[0];
        e.target.value = ""; // so the same file can be chosen again
        void choose(f);
      }}
    />
  );
  // The video plays here, out of sight; what it shows is copied into the circle.
  const player = (
    <video
      ref={video}
      muted
      playsInline
      preload="auto"
      aria-hidden="true"
      className="pointer-events-none fixed left-0 top-0 h-px w-px opacity-0"
    />
  );
  const working = busy === "making" || busy === "saving";

  // The file picker and the player stay in the same place whichever card shows, so a video that is
  // playing isn't lost when the card changes.
  const body = draft ? (
    <div
      className="rounded-2xl border border-line bg-surface p-4 text-center"
      aria-live="polite"
    >
      <p className="eyebrow">This is how it will look</p>
      <canvas
        ref={canvas}
        width={MID}
        height={MID}
        role="img"
        aria-label={`Your ${draft.kind === "video" ? "video" : "GIF"}, moving`}
        className="mx-auto mt-3 h-[132px] w-[132px] rounded-full bg-sunk"
      />
      {slide ? (
        <div className="mx-auto mt-4 max-w-[320px] text-left">
          <div className="flex items-baseline justify-between gap-2">
            <label htmlFor="loop-start" className="text-[13.5px] font-semibold">
              Slide to pick your 5 seconds
            </label>
            <span className="num shrink-0 text-[12.5px] text-ink3">
              {clock(start)} – {clock(start + len)} of {clock(draft.ms)}
            </span>
          </div>
          <input
            id="loop-start"
            type="range"
            min={0}
            max={Math.floor(draft.ms - len)}
            step={100}
            value={start}
            disabled={working}
            onChange={(e) => setStart(Number(e.target.value))}
            className="mt-2 w-full accent-accent"
          />
        </div>
      ) : (
        <p className="mt-3 text-[13.5px] leading-snug text-ink2">
          PULSE keeps all of it and makes it small.
        </p>
      )}
      <p className="num mt-2 text-[12.5px] text-ink3">
        Your {draft.kind === "video" ? "video" : "GIF"}: {fileSize(draft.size)}{" "}
        · {clock(draft.ms)} long
      </p>
      <div className="mt-3 flex flex-wrap justify-center gap-2">
        <button
          type="button"
          className="btn-accent min-h-[40px] px-5 text-[14px]"
          disabled={working}
          onClick={() => void use()}
        >
          {busy === "making"
            ? "Making it small…"
            : busy === "saving"
              ? "Saving…"
              : "Use this"}
        </button>
        <button
          type="button"
          className="btn-quiet min-h-[40px] px-4 text-[14px]"
          disabled={working}
          onClick={() => {
            clear();
            input.current?.click();
          }}
        >
          Pick another
        </button>
        <button
          type="button"
          className="btn-ghost min-h-[40px] px-4 text-[14px]"
          disabled={working}
          onClick={clear}
        >
          Cancel
        </button>
      </div>
    </div>
  ) : (
    <div className="flex items-center gap-4 rounded-2xl border border-line bg-surface p-4">
      <PersonAvatar me size={76} />
      <div className="min-w-0 flex-1">
        <p className="text-[15px] font-semibold leading-tight">Your photo</p>
        <p className="mt-0.5 text-[13px] leading-snug text-ink3">
          A photo, GIF or short video. Shown on your profile, and to friends you
          split with on PULSE.
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          <button
            type="button"
            className="btn-primary min-h-[38px] px-4 text-[14px]"
            disabled={!!busy}
            onClick={() => input.current?.click()}
          >
            <Icon name="camera" size={15} />{" "}
            {busy === "reading"
              ? "Opening…"
              : busy
                ? "Adding…"
                : has
                  ? "Change photo"
                  : "Add photo, GIF or video"}
          </button>
          {has && (
            <button
              type="button"
              className="btn-quiet min-h-[38px] px-4 text-[14px]"
              disabled={!!busy}
              onClick={() => {
                store.updateUser({
                  photo: undefined,
                  face: undefined,
                  gif: undefined,
                });
                if (hadGif && token) void dropGif(token);
                store.toast({ text: "Photo removed." });
              }}
            >
              Remove
            </button>
          )}
        </div>
      </div>
    </div>
  );
  return (
    <>
      {body}
      {picker}
      {player}
    </>
  );
}
