import { Skeleton } from "@/components/ui/Feedback";

export function DashboardLoading() {
  return (
    <div className="min-h-screen bg-white text-black">
      <div className="sticky top-0 z-30 flex items-center gap-3 border-b border-neutral-200 bg-white px-4 py-3 lg:hidden">
        <Skeleton className="h-8 w-8" />
        <Skeleton className="h-4 w-36" />
      </div>
      <div className="flex min-h-screen">
        <aside className="sticky top-0 hidden h-screen w-60 shrink-0 flex-col gap-3 border-r border-neutral-200 p-4 lg:flex">
          <Skeleton className="mb-3 h-5 w-36" />
          {Array.from({ length: 8 }, (_value, index) => (
            <Skeleton key={index} className="h-9 w-full" />
          ))}
          <Skeleton className="mt-auto h-9 w-full" />
        </aside>
        <main className="min-w-0 flex-1 px-4 py-5 sm:px-6 lg:px-8">
          <div className="mx-auto w-full max-w-6xl">
            <div className="mb-6 flex items-start justify-between gap-4">
              <div className="flex flex-col gap-2">
                <Skeleton className="h-7 w-40" />
                <Skeleton className="h-4 w-64 max-w-full" />
              </div>
              <Skeleton className="h-9 w-28" />
            </div>
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              {Array.from({ length: 4 }, (_value, index) => (
                <Skeleton key={index} className="h-24 w-full" />
              ))}
            </div>
            <div className="mt-4 grid gap-4 lg:grid-cols-2">
              <Skeleton className="h-52 w-full" />
              <Skeleton className="h-52 w-full" />
              <Skeleton className="h-44 w-full" />
              <Skeleton className="h-44 w-full" />
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}