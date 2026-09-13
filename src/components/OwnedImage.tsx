import { useState, type ImgHTMLAttributes } from "react";
import { ImageOff } from "lucide-react";

/** Never substitute a different garment for an unavailable private photograph. */
export function OwnedImage(props: ImgHTMLAttributes<HTMLImageElement>) {
  return <ImageState key={props.src} {...props} />;
}
function ImageState({ alt, className, onError, ...props }: ImgHTMLAttributes<HTMLImageElement>) {
  const [failed, setFailed] = useState(false);
  if (failed || !props.src)
    return (
      <div
        role="img"
        aria-label={`${alt ?? "Item"}: photo unavailable`}
        className={`${className ?? ""} flex min-h-16 items-center justify-center bg-surface-2 p-2 text-muted-foreground`}
      >
        <div className="text-center">
          <ImageOff className="mx-auto h-5 w-5" aria-hidden="true" />
          <span className="mt-1 block text-[10px]">Photo unavailable</span>
        </div>
      </div>
    );
  return (
    <img
      {...props}
      alt={alt ?? ""}
      className={className}
      onError={(e) => {
        setFailed(true);
        onError?.(e);
      }}
    />
  );
}
