'use client'

import { useRef, useState, useTransition } from 'react'
import { uploadAvatar, removeAvatar } from '@/app/actions'

const SIZE = 192

/**
 * Adds or replaces the current player's photo.
 *
 * The image is centre-cropped to a square and resized in the browser before it
 * is sent. A photo straight off a phone is several megabytes; this puts a few
 * kilobytes on the wire and in the database, which is what makes storing them
 * in Postgres reasonable rather than reaching for a blob service.
 */
export function AvatarUploader({ hasPhoto }: { hasPhoto: boolean }) {
  const input = useRef<HTMLInputElement>(null)
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  const choose = async (file: File) => {
    setError(null)
    try {
      const blob = await squareThumbnail(file)
      const form = new FormData()
      form.append('photo', new File([blob], 'photo', { type: blob.type }))
      startTransition(async () => {
        try {
          await uploadAvatar(form)
        } catch (e) {
          setError(e instanceof Error ? e.message : 'Upload failed.')
        }
      })
    } catch {
      setError('That image could not be read.')
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
      <input
        ref={input}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0]
          if (file) choose(file)
          e.target.value = '' // let the same file be picked again
        }}
      />

      <button
        type="button"
        disabled={pending}
        onClick={() => input.current?.click()}
        className="text-xs font-medium text-muted underline underline-offset-2 transition hover:text-foreground disabled:opacity-50"
      >
        {pending ? 'Saving…' : hasPhoto ? 'Change photo' : 'Add a photo'}
      </button>

      {hasPhoto ? (
        <button
          type="button"
          disabled={pending}
          onClick={() => startTransition(() => removeAvatar())}
          className="text-xs font-medium text-muted underline underline-offset-2 transition hover:text-foreground disabled:opacity-50"
        >
          Remove
        </button>
      ) : null}

      {error ? <span className="text-xs text-red-500">{error}</span> : null}
    </div>
  )
}

/** Centre-crop to a square and shrink to SIZE, as WebP where supported. */
async function squareThumbnail(file: File): Promise<Blob> {
  const bitmap = await createImageBitmap(file)

  const edge = Math.min(bitmap.width, bitmap.height)
  const sx = (bitmap.width - edge) / 2
  const sy = (bitmap.height - edge) / 2

  const canvas = document.createElement('canvas')
  canvas.width = SIZE
  canvas.height = SIZE

  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('canvas unavailable')
  ctx.drawImage(bitmap, sx, sy, edge, edge, 0, 0, SIZE, SIZE)
  bitmap.close()

  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, 'image/webp', 0.85)
  )
  if (blob) return blob

  // Older Safari cannot encode WebP from a canvas.
  const jpeg = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, 'image/jpeg', 0.85)
  )
  if (!jpeg) throw new Error('encode failed')
  return jpeg
}
