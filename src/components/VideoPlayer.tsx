import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Maximize } from "lucide-react";
import { toast } from "sonner";
import { api, type Detail, type Episode } from "@/lib/api";
import { Button } from "@/components/ui/button";

interface Props {
  detail: Detail;
  episode: Episode;
  episodes: Episode[];
  resumeAt: number | null;
}

/** 上报观看进度（每部剧只记最新位置）；5s 节流兜底，失败无碍 */
function report(detail: Detail, episode: Episode, positionSec: number) {
  void api("/api/me/history", {
    method: "POST",
    body: {
      itemId: detail.id,
      title: detail.title,
      posterUrl: detail.posterUrl,
      episodeId: episode.id,
      episodeNumber: episode.episodeNumber,
      positionSec: Math.floor(positionSec),
    },
  }).catch(() => {});
}

export default function VideoPlayer({ detail, episode, episodes, resumeAt }: Props) {
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
      navigate(`/play/${detail.id}/${ep.episodeNumber}`, { replace: true });
    },
    [detail.id, navigate],
  );

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
        report(detail, episode, video.currentTime);
      }
    };
    const onPause = () => report(detail, episode, video.currentTime);
    const onUnload = () => report(detail, episode, video.currentTime);
    video.addEventListener("timeupdate", onTime);
    video.addEventListener("pause", onPause);
    window.addEventListener("beforeunload", onUnload);
    return () => {
      video.removeEventListener("timeupdate", onTime);
      video.removeEventListener("pause", onPause);
      window.removeEventListener("beforeunload", onUnload);
    };
  }, [detail, episode]);

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

  // Media Session
  useEffect(() => {
    if (!("mediaSession" in navigator)) return;
    navigator.mediaSession.metadata = new MediaMetadata({
      title: `${detail.title} 第${episode.episodeNumber}集`,
      artist: "红果短剧",
      artwork: detail.posterUrl ? [{ src: detail.posterUrl, sizes: "512x512" }] : [],
    });
    navigator.mediaSession.setActionHandler("previoustrack", prev ? () => goEpisode(prev) : null);
    navigator.mediaSession.setActionHandler("nexttrack", next ? () => goEpisode(next) : null);
    return () => {
      navigator.mediaSession.setActionHandler("previoustrack", null);
      navigator.mediaSession.setActionHandler("nexttrack", null);
    };
  }, [detail, episode, prev, next, goEpisode]);

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
          src={episode.streamUrl}
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
