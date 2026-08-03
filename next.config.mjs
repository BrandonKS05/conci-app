/** @type {import('next').NextConfig} */
const nextConfig = {
  output: "standalone",
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "images.unsplash.com",
      },
    ],
  },
  async headers() {
    return [
      {
        // Force the pitch deck to download (with a friendly filename) instead of
        // opening inline, so conci.app/deck.pptx always saves the file.
        source: "/deck.pptx",
        headers: [
          {
            key: "Content-Disposition",
            value: 'attachment; filename="Conci_Pitch_Deck.pptx"',
          },
        ],
      },
    ];
  },
};

export default nextConfig;
