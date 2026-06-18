import { ImageResponse } from "next/og";

export const size = { width: 180, height: 180 };
export const contentType = "image/png";

// Full-bleed green tile (iOS applies its own rounded mask) with the white
// shuttlecock centered. Mark drawn as an inline SVG data URI so Satori
// renders the vector reliably.
const shuttle =
  "<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 140 140'>" +
  "<path d='M70,85 L42,57 L51,33 L60,53 L70,31 L80,53 L89,33 L98,57 Z' fill='#FFFFFF'/>" +
  "<ellipse cx='70' cy='87' rx='9' ry='7' fill='#D85A30'/></svg>";

export default function AppleIcon() {
  return new ImageResponse(
    (
      <div
        style={{
          display: "flex",
          width: "100%",
          height: "100%",
          background: "#04342C",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          width={132}
          height={132}
          src={`data:image/svg+xml;utf8,${encodeURIComponent(shuttle)}`}
          alt=""
        />
      </div>
    ),
    { ...size }
  );
}
