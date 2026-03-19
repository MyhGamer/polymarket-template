import type { Metadata } from "next"
import { Geist_Mono, Inter } from "next/font/google"

import "./globals.css"
import { ThemeProvider } from "@/components/theme-provider"
import { Web3Provider } from "@/components/web3-provider"
import { Navbar } from "@/components/layout/navbar"
import { SetupProgress } from "@/components/setup-progress"
import { Toaster } from "@/components/ui/sonner"
import { cn } from "@/lib/utils"

const inter = Inter({ subsets: ["latin"], variable: "--font-sans" })
const fontMono = Geist_Mono({ subsets: ["latin"], variable: "--font-mono" })

export const metadata: Metadata = {
  title: "Prediction Market Starter Kit",
  description: "Open-source prediction market starter kit",
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={cn("antialiased", fontMono.variable, "font-sans", inter.variable)}
    >
      <body>
        <ThemeProvider>
          <Web3Provider>
            <Navbar />
            <SetupProgress />
            {children}
            <Toaster position="bottom-right" />
          </Web3Provider>
        </ThemeProvider>
      </body>
    </html>
  )
}
