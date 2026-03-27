"use client";
import { Tooltip, Button } from "@heroui/react";
import { forwardRef } from "react";

// Simple className utility function
const cn = (...classes) => classes.filter(Boolean).join(" ");

// Define button variants with consistent styling
const buttonVariants = {
  intent: {
    primary: "bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 text-white shadow-md hover:shadow-lg",
    secondary: "bg-gradient-to-r from-gray-600 to-gray-700 hover:from-gray-700 hover:to-gray-800 text-white shadow-md hover:shadow-lg",
    success: "bg-gradient-to-r from-green-600 to-emerald-600 hover:from-green-700 hover:to-emerald-700 text-white shadow-md hover:shadow-lg",
    danger: "bg-gradient-to-r from-red-600 to-rose-600 hover:from-red-700 hover:to-rose-700 text-white shadow-md hover:shadow-lg",
    warning: "bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600 text-white shadow-md hover:shadow-lg",
    ghost: "bg-transparent hover:bg-gray-100 text-gray-700 border border-gray-300 hover:border-gray-400",
    outline: "bg-transparent hover:bg-gray-50 text-gray-700 border-2 border-gray-300 hover:border-gray-400",
    link: "bg-transparent hover:bg-gray-100 text-blue-600 hover:text-blue-700 p-0 h-auto min-h-0",
    black: "bg-black hover:bg-gray-800 text-white shadow-md hover:shadow-lg",
  },
  size: {
    xs: "px-2 py-1 text-xs min-h-7",
    sm: "px-3 py-1.5 text-sm min-h-8",
    md: "px-4 py-2 text-sm min-h-9",
    lg: "px-6 py-2.5 text-base min-h-10",
    xl: "px-8 py-3 text-lg min-h-12",
  },
  fullWidth: {
    true: "w-full",
    false: "w-auto",
  },
};

const CustomButton = forwardRef(({ 
  children, 
  onPress, 
  onClick, 
  intent = "black", 
  size = "sm", 
  fullWidth = false,
  disabled: propDisabled = false,
  className = "",
  startContent,
  endContent,
  tooltip,
  "aria-label": ariaLabel,
  ...props 
}, ref) => {
  // Read and convert the environment variable
  const isDevMode = process.env.NEXT_PUBLIC_IS_DEV === "true";
  const isDisabled = propDisabled || isDevMode;

  // Handle click events - prevent action in dev mode
  const handlePress = (e) => {
    if (isDevMode) {
      e?.preventDefault?.();
      e?.stopPropagation?.();
      return false;
    }
    if (onPress) {
      onPress(e);
    }
  };

  const handleClick = (e) => {
    if (isDevMode) {
      e?.preventDefault?.();
      e?.stopPropagation?.();
      return false;
    }
    if (onClick) {
      onClick(e);
    }
  };

  // Build className from variants
  const buttonClassName = cn(
    // Base styles
    "font-medium transition-all duration-200 ease-in-out rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-1",
    // Variant styles
    buttonVariants.intent[intent],
    buttonVariants.size[size],
    buttonVariants.fullWidth[fullWidth],
    // Disabled state
    isDisabled ? "opacity-60 cursor-not-allowed" : "",
    // Hover effects for non-disabled, non-link buttons
    !isDisabled && intent !== "link" ? "hover:transform hover:scale-[1.02] active:scale-[0.98]" : "",
    // Custom className
    className
  );

  // Content with optional icons
  const buttonContent = (
    <>
      {startContent && <span className="flex items-center justify-center mr-2">{startContent}</span>}
      <span className="flex items-center justify-center">{children}</span>
      {endContent && <span className="flex items-center justify-center ml-2">{endContent}</span>}
    </>
  );

  const buttonComponent = (
    <Button
      ref={ref}
      onPress={handlePress}
      onClick={handleClick}
      disabled={isDisabled}
      className={buttonClassName}
      aria-label={ariaLabel || (typeof children === "string" ? children : undefined)}
      {...props}
    >
      {buttonContent}
    </Button>
  );

  // Handle tooltips
  const finalTooltip = isDevMode 
    ? "🚫 Button is disabled because this is a demo"
    : tooltip;

  if (finalTooltip) {
    return (
      <Tooltip 
        content={finalTooltip} 
        placement="top" 
        color={isDevMode ? "primary" : "default"} 
        showArrow
        delay={500}
      >
        {buttonComponent}
      </Tooltip>
    );
  }

  return buttonComponent;
});

// Set display name for debugging
CustomButton.displayName = "CustomButton";

export default CustomButton;
