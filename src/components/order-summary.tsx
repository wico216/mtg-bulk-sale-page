"use client";

import Image from "next/image";
import Link from "next/link";

export interface OrderSummaryItem {
  name: string;
  setName: string;
  imageUrl: string | null;
  price: number | null;
  quantity: number;
}

interface OrderSummaryProps {
  items: OrderSummaryItem[];
  totalPrice: number;
  totalItems: number;
  editCartLink?: boolean;
}

export default function OrderSummary({
  items,
  totalPrice,
  totalItems,
  editCartLink = false,
}: OrderSummaryProps) {
  return (
    <div>
      {/* Heading row */}
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-sm font-semibold text-zinc-500">Order summary</h2>
        {editCartLink && (
          <Link
            href="/cart"
            className="text-sm text-accent hover:underline"
          >
            Edit cart
          </Link>
        )}
      </div>

      {/* Item rows */}
      <div className="space-y-2">
        {items.map((item, i) => (
          <div
            key={`${item.name}-${item.setName}-${i}`}
            className="flex items-center gap-3 bg-zinc-50 dark:bg-zinc-900 rounded-lg p-4"
          >
            {/* Thumbnail: 36px wide with MTG aspect ratio ~1:1.4 */}
            <div className="flex-shrink-0">
              {item.imageUrl ? (
                <Image
                  src={item.imageUrl}
                  alt={item.name}
                  width={36}
                  height={50}
                  className="rounded-sm object-cover flex-shrink-0"
                />
              ) : (
                <div className="w-[36px] h-[50px] rounded-sm bg-zinc-200 dark:bg-zinc-700 flex items-center justify-center text-zinc-400 text-[7px]">
                  No img
                </div>
              )}
            </div>

            {/* Card info */}
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold truncate">{item.name}</p>
              <p className="text-xs text-zinc-400 truncate">{item.setName}</p>
            </div>

            {/* Quantity badge */}
            <span className="text-sm text-zinc-500 flex-shrink-0">
              x{item.quantity}
            </span>

            {/* Line total */}
            <span className="text-sm ml-auto flex-shrink-0">
              {item.price !== null
                ? `$${(item.price * item.quantity).toFixed(2)}`
                : "N/A"}
            </span>
          </div>
        ))}
      </div>

      {/* Total row */}
      <div className="flex justify-between pt-4 mt-4 border-t border-zinc-200 dark:border-zinc-700">
        <span className="text-sm font-semibold">Total</span>
        <span className="text-sm font-semibold">
          ${totalPrice.toFixed(2)}
        </span>
      </div>
    </div>
  );
}
