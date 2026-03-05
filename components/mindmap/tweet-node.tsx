'use client'

import { Handle, Position, type NodeProps } from '@xyflow/react'
import { ExternalLink } from 'lucide-react'

interface TweetNodeData {
  tweetId: string
  text: string
  tweetUrl: string
  thumbnailUrl: string | null
  mediaType: string | null
  categoryColor: string
  tweetCreatedAt: string | null
  [key: string]: unknown
}

function getEmoji(text: string): string {
  const t = text.toLowerCase()
  if (/bitcoin|btc|eth|sol|crypto|defi|nft/.test(t)) return '₿'
  if (/funny|meme|lol|haha|joke/.test(t)) return '😂'
  if (/ai|llm|gpt|model|claude/.test(t)) return '🤖'
  if (/dev|code|build|engineer|github/.test(t)) return '💻'
  if (/news|break|update/.test(t)) return '📰'
  if (/design|ui|ux|figma/.test(t)) return '🎨'
  if (/money|dollar|invest|fund/.test(t)) return '💰'
  if (/video|watch|youtube/.test(t)) return '▶'
  return '📌'
}

export default function TweetNode({ data }: NodeProps) {
  const {
    text,
    tweetUrl,
    thumbnailUrl,
    mediaType,
    categoryColor = '#6366f1',
  } = data as TweetNodeData

  const isVideo = mediaType === 'video' || mediaType === 'gif'
  const label = text?.slice(0, 36) || '—'
  const color = categoryColor

  return (
    <div
      className="flex flex-col items-center select-none"
      style={{ width: 80, gap: 5 }}
    >
      {/* Hidden handles for ReactFlow edge routing */}
      <Handle
        type="target"
        position={Position.Left}
        style={{ opacity: 0, width: 1, height: 1, minWidth: 1, minHeight: 1 }}
      />

      {/* Circular avatar */}
      <div
        className="group relative"
        style={{
          width: 56,
          height: 56,
          borderRadius: '50%',
          border: `2px solid ${color}`,
          overflow: 'hidden',
          backgroundColor: `${color}18`,
          boxShadow: `0 0 12px ${color}44, 0 0 4px ${color}22`,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          cursor: 'grab',
          transition: 'box-shadow 0.2s, transform 0.2s',
          flexShrink: 0,
        }}
      >
        {thumbnailUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={thumbnailUrl}
            alt=""
            style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
            loading="lazy"
          />
        ) : (
          <span style={{ fontSize: 22, lineHeight: 1 }}>{getEmoji(text ?? '')}</span>
        )}

        {/* Video play indicator */}
        {isVideo && thumbnailUrl && (
          <div
            style={{
              position: 'absolute',
              inset: 0,
              borderRadius: '50%',
              background: 'rgba(0,0,0,0.3)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <div style={{ width: 18, height: 18, borderRadius: '50%', background: 'rgba(255,255,255,0.85)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <span style={{ fontSize: 8, marginLeft: 2 }}>▶</span>
            </div>
          </div>
        )}
      </div>

      {/* Label */}
      <p
        style={{
          fontSize: 9,
          color: '#a1a1aa',
          textAlign: 'center',
          lineHeight: 1.35,
          maxWidth: 76,
          display: '-webkit-box',
          WebkitLineClamp: 2,
          WebkitBoxOrient: 'vertical',
          overflow: 'hidden',
          wordBreak: 'break-word',
        }}
      >
        {label}
      </p>

      {/* External link */}
      <a
        href={tweetUrl}
        target="_blank"
        rel="noopener noreferrer"
        onClick={(e) => e.stopPropagation()}
        style={{
          position: 'absolute',
          top: -6,
          right: -4,
          color: color,
          opacity: 0.7,
          lineHeight: 1,
        }}
        title="Open tweet"
      >
        <ExternalLink size={9} />
      </a>

      <Handle
        type="source"
        position={Position.Right}
        style={{ opacity: 0, width: 1, height: 1, minWidth: 1, minHeight: 1 }}
      />
    </div>
  )
}
