import React from "react";
import Image from "next/image";

const Footer = () => (
  <footer className="w-full bg-[#101014] border-t border-white/10 px-5 py-8 flex flex-col items-center text-center space-y-4">
    <Image src="/aniflix-logo.png" alt="ANIFLIX NETWORK TAMIL" width={88} height={88} className="rounded-full object-cover" />
    <div className="font-extrabold tracking-wide text-white">ANIFLIX <span className="text-emerald-400">NETWORK TAMIL</span></div>
    <p className="text-xs text-gray-400">Discover anime, explore new releases and enjoy your watchlist.</p>
    <p className="text-xs text-gray-500">© {new Date().getFullYear()} ANIFLIX NETWORK TAMIL</p>
  </footer>
);
export default Footer;
