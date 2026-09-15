export default function NotebookLayout({ children }: { children: React.ReactNode }) {
  return <main className="h-full overflow-y-auto px-2 pb-3 pt-1 sm:px-4 sm:pt-2 lg:px-6">{children}</main>;
}
