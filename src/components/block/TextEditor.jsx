"use client";

import SunEditor from "suneditor-react";
import "suneditor/dist/css/suneditor.min.css";

export default function TextEditor({ value, onChange }) {
  return (
    <SunEditor
      setContents={value}
      onChange={onChange}
      height="500px"
      placeholder="Write product description..."
      setOptions={{
        defaultStyle: "direction: ltr; text-align: left;",
        buttonList: [
          ["undo", "redo"],
          ["font", "fontSize"],
          ["bold", "italic", "underline", "strike"],
          ["fontColor", "hiliteColor", "align"],
          ["list", "table"],
          ["link", "image", "video"],
          ["fullScreen", "codeView", "removeFormat"],
        ],
      }}
    />
  );
}
