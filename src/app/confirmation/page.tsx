import Header from "@/components/header";
import { Suspense } from "react";
import ConfirmationClient from "./confirmation-client";

export const metadata = {
  title: "Order Confirmed -- Viki MTG Bulk Store",
};

export default function ConfirmationPage() {
  return (
    <div className="min-h-screen font-sans bg-white dark:bg-zinc-950 text-zinc-900 dark:text-zinc-100">
      <Header />
      <main>
        <Suspense
          fallback={
            <div className="max-w-md mx-auto px-4 py-16 text-center">
              <div className="w-16 h-16 rounded-full bg-zinc-100 dark:bg-zinc-800 animate-pulse mx-auto mb-6" />
              <div className="h-8 w-48 bg-zinc-100 dark:bg-zinc-800 rounded animate-pulse mx-auto mb-4" />
              <div className="h-5 w-32 bg-zinc-100 dark:bg-zinc-800 rounded animate-pulse mx-auto" />
            </div>
          }
        >
          <ConfirmationClient />
        </Suspense>
      </main>
    </div>
  );
}
