export function AppLogo({ size = 72 }: { size?: number }) {
  return (
    <img
      className="app-logo"
      src="/nestcam-reviewer.png"
      alt="Person reviewing bird nest photos on a computer"
      width={size}
      height={size}
    />
  );
}
