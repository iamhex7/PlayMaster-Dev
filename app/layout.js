import './globals.css'

export const metadata = {
  title: 'PlayMaster',
  description: 'AI-Powered Game Host - Hackathon Project',
}

export default function RootLayout({ children }) {
  return (
    <html lang="zh-CN">
      <body>{children}</body>
    </html>
  )
}
