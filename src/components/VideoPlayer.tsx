import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Maximize } from "lucide-react";
import Hls from "hls.js";
import { toast } from "sonner";
import { invalidateRecommendCache, SOURCES } from "@/lib/sources";
import { api, type Detail, type Episode } from "@/lib/api";
import { Button } from "@/components/ui/button";

interface Props {
  detail: Detail;
  episode: Episode;
  episodes: Episode[];
  resumeAt: number | null;
  source: string;
}

/** 上报观看进度（每部剧只记最新位置）；5s 节流兜底，失败无碍 */
function report(detail: Detail, episode: Episode, positionSec: number, source: string) {
  void api("/api/me/history", {
    method: "POST",
    body: {
      itemId: detail.id,
      title: detail.title,
      posterUrl: detail.posterUrl,
      episodeId: episode.id,
      episodeNumber: episode.episodeNumber,
      positionSec: Math.floor(positionSec),
      source,
    },
  }).then(() => invalidateRecommendCache()).catch(() => {});
}

export default function VideoPlayer({ detail, episode, episodes, resumeAt, source }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const lastReportRef = useRef(0);
  // null=未知(默认 16:9)；加载元数据后按真实方向切换
  const [portrait, setPortrait] = useState<boolean | null>(null);
  const navigate = useNavigate();

  const idx = episodes.findIndex((e) => e.episodeNumber === episode.episodeNumber);
  const next = idx >= 0 ? episodes[idx + 1] : undefined;
  const prev = idx > 0 ? episodes[idx - 1] : undefined;

  const goEpisode = useCallback(
    (ep: Episode) => {
      navigate(`/play/${source}/${encodeURIComponent(detail.id)}/${ep.episodeNumber}`, { replace: true });
    },
    [detail.id, navigate, source],
  );

  // Media Session：锁屏/灵动岛显示剧名集数，支持上一集/下一集
  useEffect(() => {
    if (!("mediaSession" in navigator)) return;
    navigator.mediaSession.metadata = new MediaMetadata({
      title: `${detail.title} 第${episode.episodeNumber}集`,
      artist: SOURCES[source as "hongguo" | "huangguo"]?.label ?? "短剧",
      // 用原始海报地址：iOS 系统拉 artwork 不带本站登录 cookie
      artwork: detail.posterUrl ? [{ src: detail.posterUrl, sizes: "512x512" }] : [],
    });
    navigator.mediaSession.setActionHandler("previoustrack", prev ? () => goEpisode(prev) : null);
    navigator.mediaSession.setActionHandler("nexttrack", next ? () => goEpisode(next) : null);
    return () => {
      navigator.mediaSession.setActionHandler("previoustrack", null);
      navigator.mediaSession.setActionHandler("nexttrack", null);
    };
  }, [detail, episode, prev, next, goEpisode, source]);

  // 加载媒体：m3u8 走 HLS（Safari 原生 / 其他浏览器 hls.js），mp4 直接 src
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    const src = episode.streamUrl;
    let raw = "";
    try {
      raw = decodeURIComponent(new URLSearchParams(src.split("?")[1] ?? "").get("u") ?? "");
    } catch {
      raw = "";
    }
    let isHls = /\.m3u8(\?|$)/i.test(raw) || /\.m3u8(\?|$)/i.test(src);
    let hls: { destroy: () => void } | null = null;
    let cancelled = false;

    void (async () => {
      // URL 无 .m3u8 后缀时（黄果流是 /videos5/hash 形式）HEAD 探测 content-type
      if (!isHls) {
        try {
          const probe = await fetch(src, { method: "HEAD", credentials: "same-origin" });
          isHls = (probe.headers.get("content-type") ?? "").includes("mpegurl");
        } catch {
          // 探测失败按非 HLS 处理
        }
      }
      if (cancelled) return;
      if (isHls && !video.canPlayType("application/vnd.apple.mpegurl") && Hls.isSupported()) {
        const h = new Hls();
        hls = h;
        h.loadSource(src);
        h.attachMedia(video);
        return;
      }
      video.src = src;
    })();
    return () => {
      cancelled = true;
      hls?.destroy();
      video.removeAttribute("src");
      video.load();
    };
  }, [episode.streamUrl]);

  // 恢复进度
  useEffect(() => {
    const video = videoRef.current;
    if (!video || resumeAt === null) return;
    const onMeta = () => {
      if (resumeAt > 0 && resumeAt < video.duration - 5) video.currentTime = resumeAt;
    };
    video.addEventListener("loadedmetadata", onMeta);
    return () => video.removeEventListener("loadedmetadata", onMeta);
  }, [resumeAt, episode.id]);

  // 进度上报：timeupdate 5s 节流 + pause + 页面卸载
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    const onTime = () => {
      const now = Date.now();
      if (now - lastReportRef.current >= 5000) {
        lastReportRef.current = now;
        report(detail, episode, video.currentTime, source);
      }
    };
    const onPause = () => report(detail, episode, video.currentTime, source);
    const onUnload = () => report(detail, episode, video.currentTime, source);
    video.addEventListener("timeupdate", onTime);
    video.addEventListener("pause", onPause);
    window.addEventListener("beforeunload", onUnload);
    return () => {
      video.removeEventListener("timeupdate", onTime);
      video.removeEventListener("pause", onPause);
      window.removeEventListener("beforeunload", onUnload);
    };
  }, [detail, episode, source]);

  // 自动连播
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    const onEnded = () => {
      if (next) {
        goEpisode(next);
      } else {
        toast.success("已播完全部");
      }
    };
    video.addEventListener("ended", onEnded);
    return () => video.removeEventListener("ended", onEnded);
  }, [next, goEpisode]);

  // 切集后自动播放（同源同元素链内，浏览器允许）
  useEffect(() => {
    videoRef.current?.play().catch(() => {});
  }, [episode.id]);


  const fullscreen = () => {
    const video = videoRef.current;
    if (!video) return;
    if (video.requestFullscreen) {
      void video.requestFullscreen();
    } else if ("webkitEnterFullscreen" in video) {
      // iOS Safari
      (video as HTMLVideoElement & { webkitEnterFullscreen: () => void }).webkitEnterFullscreen();
    }
  };

  return (
    <div className="flex flex-col gap-3">
      <div className="relative overflow-hidden rounded-lg bg-black">
        <video
          ref={videoRef}
          controls
          playsInline
          preload="auto"
          onLoadedMetadata={(e) =>
            setPortrait(e.currentTarget.videoHeight > e.currentTarget.videoWidth)
          }
          className={
            portrait
              ? // 竖屏剧：拉高容器；桌面端限高避免占满整屏
                "mx-auto aspect-[9/16] max-h-[70vh] w-full object-contain sm:aspect-auto sm:h-[70vh] sm:w-auto"
              : "aspect-video w-full"
          }
        />
      </div>
      <div className="flex items-center gap-2">
        <h1 className="min-w-0 flex-1 truncate text-base font-medium">
          {detail.title} · 第{episode.episodeNumber}集
        </h1>
        <Button variant="outline" size="sm" onClick={fullscreen}>
          <Maximize className="mr-1 h-4 w-4" /> 全屏
        </Button>
      </div>
    </div>
  );
}
