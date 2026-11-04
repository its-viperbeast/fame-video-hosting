import { ShieldCheck } from "lucide-react";

export default function Upload() {
  return (
    <div className="page-heading upload-page-heading">
      <div>
        <h1>Upload your videos.</h1>
        <p>A little space for your next big idea. Add your videos and we’ll take it from here.</p>
      </div>
      <span className="private-workspace">
        <ShieldCheck size={15} />
        Private by default
      </span>
    </div>
  );
}
