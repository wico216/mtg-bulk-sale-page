export default function Header() {
  return (
    <header className="border-b border-zinc-200 dark:border-zinc-800">
      <div className="max-w-7xl mx-auto px-4 py-3">
        <p className="text-lg">
          <span className="font-bold text-accent">Viki</span>{" "}
          <span className="font-light text-zinc-500">MTG Bulk Store</span>
        </p>
      </div>
    </header>
  );
}
