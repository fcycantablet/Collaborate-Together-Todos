import asyncio
import base64
import os
import sys
from dotenv import load_dotenv

load_dotenv("/app/backend/.env")

from emergentintegrations.llm.chat import LlmChat, UserMessage

PROMPT = (
    "Design a flat, modern iOS app icon for a collaborative to-do list app called 'Collaborate Together'. "
    "Neo-brutalist style: a bold black-outlined white checkbox with a thick black checkmark in the center, "
    "with two simple abstract overlapping human silhouettes (one butter-yellow, one coral-red) behind the checkbox, "
    "symbolizing two people collaborating. Solid warm butter-yellow (#FFD93D) background filling the entire square. "
    "Thick black outlines, hard offset shadows, flat vector illustration, playful and clean. "
    "NO text, NO letters, NO words anywhere. Full-bleed square composition, edge to edge, no rounded corners, no border margin. "
    "1024x1024 pixels."
)


async def main():
    api_key = os.getenv("EMERGENT_LLM_KEY")
    chat = LlmChat(api_key=api_key, session_id="icon-gen-collab-together", system_message="You are an expert app icon designer")
    chat.with_model("gemini", "gemini-3.1-flash-image-preview").with_params(modalities=["image", "text"])

    msg = UserMessage(text=PROMPT)
    text, images = await chat.send_message_multimodal_response(msg)
    print(f"Text response: {(text or '')[:100]}")
    if not images:
        print("ERROR: no images returned")
        sys.exit(1)
    image_bytes = base64.b64decode(images[0]["data"])
    out = "/app/scripts/icon_raw.png"
    with open(out, "wb") as f:
        f.write(image_bytes)
    print(f"Saved {out} ({len(image_bytes)} bytes)")


asyncio.run(main())
