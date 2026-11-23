import { NextRequest, NextResponse } from 'next/server';
import { AccessToken } from 'livekit-server-sdk';

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const room = searchParams.get('room');
    const username = searchParams.get('username');
    const identity = searchParams.get('identity');

    if (!room || !username || !identity) {
      return NextResponse.json(
        { error: 'room, username ve identity parametreleri zorunludur.' },
        { status: 400 }
      );
    }

    const apiKey = process.env.LIVEKIT_API_KEY?.trim();
    const apiSecret = process.env.LIVEKIT_API_SECRET?.trim();
    const livekitUrl = process.env.NEXT_PUBLIC_LIVEKIT_URL?.trim();

    if (!apiKey || !apiSecret || !livekitUrl) {
      return NextResponse.json(
        {
          error: 'LiveKit ortam değişkenleri (.env.local) eksik.',
          missing: {
            LIVEKIT_API_KEY: !apiKey,
            LIVEKIT_API_SECRET: !apiSecret,
            NEXT_PUBLIC_LIVEKIT_URL: !livekitUrl,
          },
        },
        { status: 500 }
      );
    }

    const at = new AccessToken(apiKey, apiSecret, {
      identity,
      name: username,
      ttl: '2h',
    });

    at.addGrant({
      roomJoin: true,
      room,
      canPublish: true,
      canSubscribe: true,
      canPublishData: true,
    });

    const token = await at.toJwt();
    return NextResponse.json({ token, url: livekitUrl });
  } catch (err: unknown) {
    const message =
      err instanceof Error ? err.message : 'Token oluşturulurken hata oluştu.';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}