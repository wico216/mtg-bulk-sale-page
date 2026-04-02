"use client";

import Link from "next/link";
import { useCartStore } from "@/lib/store/cart-store";

export default function Header() {
  const totalItems = useCartStore((s) => s.totalItems());

  return (
    <header className="border-b border-zinc-200 dark:border-zinc-800">
      <div className="max-w-7xl mx-auto px-4 py-3 flex items-center justify-between">
        <p className="text-lg">
          <span className="font-bold text-accent">Viki</span>{" "}
          <span className="font-light text-zinc-500">MTG Bulk Store</span>
        </p>
        <Link
          href="/cart"
          className="relative p-1.5 rounded-md hover:bg-zinc-100 dark:hover:bg-zinc-800"
          aria-label="Shopping cart"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            fill="none"
            viewBox="0 0 24 24"
            strokeWidth={1.5}
            stroke="currentColor"
            className="w-5 h-5"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M2.25 3h1.386c.51 0 .955.343 1.087.835l.383 1.437M7.5 14.25a3 3 0 0 0-3 3h15.75m-12.75-3h11.218c1.121 0 2.002-.881 1.745-1.97l-1.594-6.747a1.125 1.125 0 0 0-1.1-.88H5.625m1.875 9.75a1.125 1.125 0 1 0 0 2.25 1.125 1.125 0 0 0 0-2.25Zm9.75 0a1.125 1.125 0 1 0 0 2.25 1.125 1.125 0 0 0 0-2.25Z"
            />
          </svg>
          {totalItems > 0 && (
            <span className="absolute -top-1 -right-1 flex items-center justify-center min-w-[18px] h-[18px] rounded-full bg-accent text-white text-[10px] font-bold px-1">
              {totalItems > 99 ? "99+" : totalItems}
            </span>
          )}
        </Link>
      </div>
    </header>
  );
}
