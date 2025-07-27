import os
import asyncio
import websockets
import json
import requests
from dotenv import load_dotenv

load_dotenv()

ASSEMBLYAI_API_KEY = os.getenv("ASSEMBLYAI_API_KEY")
ASSEMBLYAI_TOKEN_URL = "https://streaming.assemblyai.com/v3/token?expires_in_seconds=600"
ASSEMBLYAI_WS_BASE = "wss://streaming.assemblyai.com/v3/ws?sample_rate=16000&formatted_finals=true&token="

# Get a Universal Streaming API token for AssemblyAI (10 min expiration)
def get_assemblyai_token_universal_streaming():
    headers = {"authorization": ASSEMBLYAI_API_KEY}
    resp = requests.get(ASSEMBLYAI_TOKEN_URL, headers=headers, timeout=10)
    resp.raise_for_status()
    return resp.json()["token"]

async def stream_to_assemblyai(audio_generator):
    """
    Streams PCM audio chunks to AssemblyAI Universal-Streaming API and yields transcript text results.
    :param audio_generator: async generator yielding raw PCM audio bytes
    :yield: transcript text (str)
    """
    token = get_assemblyai_token_universal_streaming()
    ws_url = ASSEMBLYAI_WS_BASE + token
    async with websockets.connect(ws_url) as ws:
        async def send_audio():
            async for chunk in audio_generator:
                await ws.send(chunk)
            await ws.send(json.dumps({"terminate_session": True}))

        async def receive_transcripts():
            async for msg in ws:
                data = json.loads(msg)
                if data.get("message_type") == "FinalTranscript":
                    yield data.get("text", "")

        send_task = asyncio.create_task(send_audio())
        async for transcript in receive_transcripts():
            yield transcript
        await send_task 