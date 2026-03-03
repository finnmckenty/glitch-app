/**
 * AI Image Generation via Gemini 3 (gemini-3-pro-image-preview).
 *
 * Set VITE_NANO_BANANA_API_KEY in your .env to your Google AI API key.
 * Docs: https://ai.google.dev/gemini-api/docs/gemini-3
 */

export interface AIImageResult {
  /** Object URL for the generated image blob */
  imageUrl: string
  width: number
  height: number
}

const API_KEY = import.meta.env.VITE_NANO_BANANA_API_KEY as string | undefined

const MODEL = 'gemini-3-pro-image-preview'
const ENDPOINT = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`

/**
 * Pick the closest standard aspect ratio from width/height.
 */
function getAspectRatio(width: number, height: number): string {
  const ratio = width / height
  const options: [string, number][] = [
    ['1:1', 1],
    ['16:9', 16 / 9],
    ['9:16', 9 / 16],
    ['4:3', 4 / 3],
    ['3:4', 3 / 4],
  ]
  let best = options[0]
  let bestDiff = Math.abs(ratio - best[1])
  for (const opt of options) {
    const diff = Math.abs(ratio - opt[1])
    if (diff < bestDiff) {
      best = opt
      bestDiff = diff
    }
  }
  return best[0]
}

/**
 * Generate an image from a text prompt via Gemini 3.
 * Returns an object URL for the generated image.
 */
export async function generateAIImage(
  prompt: string,
  width: number,
  height: number
): Promise<AIImageResult> {
  if (!API_KEY) {
    throw new Error(
      'API key not configured. Set VITE_NANO_BANANA_API_KEY in your .env file.'
    )
  }

  const aspectRatio = getAspectRatio(width, height)

  const response = await fetch(ENDPOINT, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-goog-api-key': API_KEY,
    },
    body: JSON.stringify({
      contents: [
        {
          parts: [{ text: prompt }],
        },
      ],
      generationConfig: {
        responseModalities: ['TEXT', 'IMAGE'],
        imageConfig: {
          aspectRatio,
        },
      },
    }),
  })

  if (!response.ok) {
    const text = await response.text().catch(() => 'Unknown error')
    throw new Error(`Image generation failed (${response.status}): ${text}`)
  }

  const data = await response.json()

  // Find the image part in the response
  const candidates = data.candidates
  if (!candidates || candidates.length === 0) {
    throw new Error('No candidates returned from image generation')
  }

  const parts = candidates[0].content?.parts
  if (!parts) {
    throw new Error('No content parts in generation response')
  }

  // Look for inlineData (base64 image)
  const imagePart = parts.find(
    (p: any) => p.inlineData?.mimeType?.startsWith('image/')
  )

  if (!imagePart) {
    // Check if there's a text-only response (e.g. refusal)
    const textPart = parts.find((p: any) => p.text)
    if (textPart) {
      throw new Error(`Generation returned text only: ${textPart.text.slice(0, 200)}`)
    }
    throw new Error('No image returned from generation')
  }

  // Decode base64 to blob
  const { mimeType, data: b64Data } = imagePart.inlineData
  const binary = atob(b64Data)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i)
  }
  const blob = new Blob([bytes], { type: mimeType })
  const imageUrl = URL.createObjectURL(blob)

  // Get actual dimensions from the decoded image
  const bitmap = await createImageBitmap(blob)
  const actualWidth = bitmap.width
  const actualHeight = bitmap.height
  bitmap.close()

  return {
    imageUrl,
    width: actualWidth,
    height: actualHeight,
  }
}
