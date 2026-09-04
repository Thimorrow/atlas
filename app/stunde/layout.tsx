// Gleicher scrollbarer Rahmen wie /settings und /faecher: die Layout-Hoehe
// ist fix (h-dvh, overflow-hidden im Root-Layout), gescrollt wird innerhalb
// der Seite. Ohne diesen Rahmen klebte der Inhalt oben ohne Abstand am Rand
// und wurde bei Ueberlaenge abgeschnitten statt scrollbar.
export default function ScrollLayout({ children }: { children: React.ReactNode }) {
  return <main className="h-full overflow-y-auto px-6 pt-6 pb-8 lg:px-8">{children}</main>;
}
