import React from "react";

const Empty = ({ title, description }) => {
  return (
    <div className="flex flex-col justify-center items-center mt-[50px]">
      <img className="size-80" src="/empty.svg" alt="Empty state" />
      <div className="text-center mt-1">
        <h1 className="text-[20px] font-bold">{title || "No Items Found"}</h1>
        <p className="text-gray-500">{description || "It seems there is nothing to display. Please add some content."}</p>
      </div>
    </div>
  );
};

export default Empty;
