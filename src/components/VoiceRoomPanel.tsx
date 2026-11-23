'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  LiveKitRoom,
  RoomAudioRenderer,
  useConnectionState,
  useLocalParticipant,
  useParticipants,
  VideoTrack,
} from '@livekit/components-react';
import { ConnectionState, DisconnectReason, Track } from 'livekit-client';
import { Profile, Room } from '@/types/app';
import { Mic, MicOff, MonitorUp, MonitorOff, PhoneOff, Volume2 } from 'lucide-react';

interface VoiceRoomPanelProps {
  room: Room;
  currentUser: Profile;
  onLeave: () => void;
}

function VoiceControls({
  onLeave,
  disconnectReason,
}: {
  onLeave: () => void;
  disconnectReason: string | null;
}) {
  const connectionState = useConnectionState();
  const { localParticipant, isMicrophoneEnabled, isScreenShareEnabled } =
    useLocalParticipant();
  const participants = useParticipants();
  const [actionError, setActionError] = useState<string | null>(null);

  const isConnected = connectionState === ConnectionState.Connected;

  const toggleMic = async () => {
    setActionError(null);
    if (!isConnected) {
      setActionError('Henüz ses sunucusuna bağlanılmadı, lütfen bekleyin.');
      return;
    }
    try {
      await localParticipant.setMicrophoneEnabled(!isMicrophoneEnabled);
    } catch (err: unknown) {
      setActionError(
        err instanceof Error ? err.message : 'Mikrofon açılamadı.'
      );
    }
  };

  const toggleScreenShare = async () => {
    setActionError(null);
    if (!isConnected) {
      setActionError('Henüz ses sunucusuna bağlanılmadı, lütfen bekleyin.');
      return;
    }
    try {
      await localParticipant.setScreenShareEnabled(!isScreenShareEnabled);
    } catch (err: unknown) {
      setActionError(
        err instanceof Error ? err.message : 'Ekran paylaşımı başlatılamadı.'
      );
    }
  };

  const screenTrackRef = participants
    .flatMap((p) =>
      Array.from(p.trackPublications.values())
        .filter((pub) => pub.source === Track.Source.ScreenShare && pub.track)
        .map((pub) => ({
          participant: p,
          publication: pub,
          source: Track.Source.ScreenShare,
        }))
    )[0];

  return (
    <div className="p-3 bg-[#141420] border-b border-zinc-800 space-y-3">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-2">
          <Volume2
            className={`w-4 h-4 ${
              isConnected ? 'text-emerald-400 animate-pulse' : 'text-amber-400'
            }`}
          />
          <span className="text-xs font-semibold text-emerald-300">
            {isConnected
              ? `Sesli Sohbet Aktif (${participants.length} kişi)`
              : `Bağlantı durumu: ${connectionState}`}
          </span>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            disabled={!isConnected}
            onClick={toggleMic}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition cursor-pointer disabled:opacity-50 ${
              isMicrophoneEnabled
                ? 'bg-zinc-800 hover:bg-zinc-700 text-zinc-100'
                : 'bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 border border-amber-500/40'
            }`}
          >
            {isMicrophoneEnabled ? (
              <>
                <Mic className="w-3.5 h-3.5 text-emerald-400" />
                Mikrofon Açık
              </>
            ) : (
              <>
                <MicOff className="w-3.5 h-3.5 text-amber-400" />
                Mikrofon Kapalı
              </>
            )}
          </button>

          <button
            type="button"
            disabled={!isConnected}
            onClick={toggleScreenShare}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition cursor-pointer disabled:opacity-50 ${
              isScreenShareEnabled
                ? 'bg-indigo-600 hover:bg-indigo-500 text-white'
                : 'bg-zinc-800 hover:bg-zinc-700 text-zinc-200'
            }`}
          >
            {isScreenShareEnabled ? (
              <>
                <MonitorOff className="w-3.5 h-3.5" />
                Paylaşımı Durdur
              </>
            ) : (
              <>
                <MonitorUp className="w-3.5 h-3.5" />
                Ekran Paylaş
              </>
            )}
          </button>

          <button
            type="button"
            onClick={onLeave}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-red-600/20 hover:bg-red-600/30 border border-red-500/40 text-red-300 text-xs font-medium transition cursor-pointer"
          >
            <PhoneOff className="w-3.5 h-3.5" />
            Ayrıl
          </button>
        </div>
      </div>

      {(disconnectReason || actionError) && (
        <div className="px-3 py-1.5 rounded-lg bg-amber-500/10 border border-amber-500/30 text-amber-300 text-xs">
          {actionError || `Bağlantı koptu: ${disconnectReason}`}
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        {participants.map((p) => (
          <div
            key={p.sid}
            className={`px-2.5 py-1 rounded-full text-xs flex items-center gap-1.5 border ${
              p.isSpeaking
                ? 'bg-emerald-500/20 border-emerald-400 text-emerald-200'
                : 'bg-zinc-900 border-zinc-800 text-zinc-300'
            }`}
          >
            <span className="w-2 h-2 rounded-full bg-emerald-400" />
            <span>{p.name || p.identity}</span>
          </div>
        ))}
      </div>

      {screenTrackRef && (
        <div className="rounded-xl overflow-hidden border border-zinc-800 bg-black max-h-64 flex items-center justify-center">
          <VideoTrack
            trackRef={screenTrackRef as any}
            className="max-h-64 w-full object-contain"
          />
        </div>
      )}
    </div>
  );
}

export default function VoiceRoomPanel({
  room,
  currentUser,
  onLeave,
}: VoiceRoomPanelProps) {
  const [token, setToken] = useState<string | null>(null);
  const [serverUrl, setServerUrl] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [disconnectReason, setDisconnectReason] = useState<string | null>(null);

  const roomId = room.id;
  const userId = currentUser.id;
  const username = currentUser.username;

  useEffect(() => {
    let active = true;

    const fetchToken = async () => {
      try {
        setErrorMsg(null);
        setDisconnectReason(null);

        const res = await fetch(
          `/api/livekit-token?room=${encodeURIComponent(roomId)}&username=${encodeURIComponent(
            username
          )}&identity=${encodeURIComponent(userId)}`
        );
        const data = await res.json();

        if (!res.ok) {
          throw new Error(data.error || 'Token alınamadı');
        }

        if (active) {
          setToken(data.token);
          setServerUrl(data.url);
        }
      } catch (err: unknown) {
        if (active) {
          setErrorMsg(
            err instanceof Error ? err.message : 'LiveKit bağlantısı kurulamadı'
          );
        }
      }
    };

    fetchToken();

    return () => {
      active = false;
    };
  }, [roomId, userId, username]);

  const handleConnected = useCallback(() => {
    setDisconnectReason(null);
  }, []);

  const handleDisconnected = useCallback((reason?: DisconnectReason) => {
    setDisconnectReason(
      reason !== undefined ? `Kod ${reason}` : 'Sunucu bağlantısı sonlandı'
    );
  }, []);

  const handleError = useCallback((err: Error) => {
    setDisconnectReason(err.message || 'LiveKit bağlantı hatası');
  }, []);

  if (errorMsg) {
    return (
      <div className="p-3 bg-red-500/10 border-b border-red-500/30 text-red-300 text-xs flex items-center justify-between">
        <span>Ses hatası: {errorMsg}</span>
        <button
          type="button"
          onClick={onLeave}
          className="px-2.5 py-1 rounded bg-red-600/30 text-white cursor-pointer"
        >
          Kapat
        </button>
      </div>
    );
  }

  if (!token || !serverUrl) {
    return (
      <div className="p-3 bg-[#141420] border-b border-zinc-800 text-xs text-zinc-400">
        Ses odasına bağlanılıyor...
      </div>
    );
  }

  return (
    <LiveKitRoom
      token={token}
      serverUrl={serverUrl}
      connect={true}
      audio={false}
      video={false}
      onConnected={handleConnected}
      onDisconnected={handleDisconnected}
      onError={handleError}
    >
      <RoomAudioRenderer />
      <VoiceControls onLeave={onLeave} disconnectReason={disconnectReason} />
    </LiveKitRoom>
  );
}