export default function Placeholder({ name }: { name: string }) {
  return (
    <div className="rounded-2xl border border-line bg-surface p-10 text-center">
      <h1 className="text-xl font-bold capitalize">{name}</h1>
      <p className="mt-1 text-muted">
        This screen is built next, on the same engine.
      </p>
    </div>
  );
}
