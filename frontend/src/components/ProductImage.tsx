import React, { useState } from "react";

interface ProductImageProps {
  name: string;
  category?: string;
  imageUrls?: string[];
  className?: string;
  alt?: string;
}

// Category emoji fallbacks shown when no image loads
const CATEGORY_FALLBACK: Record<string, string> = {
  vegetables: "🥦",
  fruits: "🍎",
  dairy: "🥛",
  snacks: "🍿",
  beverages: "🧃",
  staples: "🌾",
  icecream: "🍦",
  personalcare: "🧴",
  household: "🧹",
  pharmacy: "💊",
};

function toSlug(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

// CloudFront CDN base URL — set VITE_CDN_URL in .env.production
// Falls back to local public folder in dev
const CDN_BASE =
  (import.meta.env.VITE_CDN_URL as string | undefined)?.replace(/\/$/, "") ??
  "";

function getImageSrc(name: string): string {
  const slug = toSlug(name);
  if (CDN_BASE) {
    // Use CloudFront CDN (production)
    return `${CDN_BASE}/products/${slug}.jpg`;
  }
  // Use local public folder (development)
  return `/images/products/${slug}.jpg`;
}

export const ProductImage: React.FC<ProductImageProps> = ({
  name,
  category = "",
  imageUrls = [],
  className = "",
  alt,
}) => {
  // Track which source we're on: 0 = CDN/local slug, 1 = imageUrls[0], 2 = fallback emoji
  const [stage, setStage] = useState(0);

  const primarySrc = getImageSrc(name);
  const remoteSrc = imageUrls[0] || "";
  const emoji = CATEGORY_FALLBACK[category] ?? "🛒";

  if (stage === 2) {
    // Emoji placeholder — always works
    return (
      <div
        className={`flex items-center justify-center bg-gray-100 ${className}`}
      >
        <span style={{ fontSize: "2rem" }}>{emoji}</span>
      </div>
    );
  }

  return (
    <img
      src={stage === 0 ? primarySrc : remoteSrc}
      alt={alt ?? name}
      className={className}
      onError={() => {
        if (stage === 0 && remoteSrc) {
          setStage(1); // try remote imageUrls[0]
        } else {
          setStage(2); // show emoji
        }
      }}
    />
  );
};
