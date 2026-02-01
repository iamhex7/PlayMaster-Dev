import './globals.css'

export const metadata = {
  title: 'PlayMaster',
  description: 'Hackathon - 进入房间一起玩',
}

export default function RootLayout({ children }) {
  return (
    <html lang="zh-CN">
      <body className="bg-gray-100 min-h-screen">{children}</body>
    </html>
  )
}
