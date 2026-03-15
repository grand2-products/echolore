const __rest =
  (this && this.__rest) ||
  ((s, e) => {
    const t = {};
    for (const p in s)
      if (Object.prototype.hasOwnProperty.call(s, p) && e.indexOf(p) < 0) t[p] = s[p];
    if (s != null && typeof Object.getOwnPropertySymbols === "function")
      for (let i = 0, p = Object.getOwnPropertySymbols(s); i < p.length; i++) {
        if (e.indexOf(p[i]) < 0 && Object.prototype.propertyIsEnumerable.call(s, p[i]))
          t[p[i]] = s[p[i]];
      }
    return t;
  });
Object.defineProperty(exports, "__esModule", { value: true });
exports.Button = Button;
exports.Button = Button;
const variantStyles = {
  primary: "bg-blue-500 text-white hover:bg-blue-600",
  secondary: "bg-gray-200 text-gray-800 hover:bg-gray-300",
  danger: "bg-red-500 text-white hover:bg-red-600",
  ghost: "bg-transparent hover:bg-gray-100",
};
const sizeStyles = {
  sm: "px-3 py-1 text-sm",
  md: "px-4 py-2",
  lg: "px-6 py-3 text-lg",
};
function Button(_a) {
  const _b = _a.variant;
  const variant = _b === void 0 ? "primary" : _b;
  const _c = _a.size;
  const size = _c === void 0 ? "md" : _c;
  const children = _a.children;
  const _d = _a.className;
  const className = _d === void 0 ? "" : _d;
  const disabled = _a.disabled;
  const props = __rest(_a, ["variant", "size", "children", "className", "disabled"]);
  const baseStyles =
    "inline-flex items-center justify-center rounded-lg font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed";
  return (
    <button
      type="button"
      className={""
        .concat(baseStyles, " ")
        .concat(variantStyles[variant], " ")
        .concat(sizeStyles[size], " ")
        .concat(className)}
      disabled={disabled}
      {...props}
    >
      {children}
    </button>
  );
}
const variantStyles = {
  primary: "bg-blue-500 text-white hover:bg-blue-600",
  secondary: "bg-gray-200 text-gray-800 hover:bg-gray-300",
  danger: "bg-red-500 text-white hover:bg-red-600",
  ghost: "bg-transparent hover:bg-gray-100",
};
const sizeStyles = {
  sm: "px-3 py-1 text-sm",
  md: "px-4 py-2",
  lg: "px-6 py-3 text-lg",
};
function Button(_a) {
  const _b = _a.variant;
  const variant = _b === void 0 ? "primary" : _b;
  const _c = _a.size;
  const size = _c === void 0 ? "md" : _c;
  const children = _a.children;
  const _d = _a.className;
  const className = _d === void 0 ? "" : _d;
  const disabled = _a.disabled;
  const props = __rest(_a, ["variant", "size", "children", "className", "disabled"]);
  const baseStyles =
    "inline-flex items-center justify-center rounded-lg font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed";
  return (
    <button
      type="button"
      className={""
        .concat(baseStyles, " ")
        .concat(variantStyles[variant], " ")
        .concat(sizeStyles[size], " ")
        .concat(className)}
      disabled={disabled}
      {...props}
    >
      {children}
    </button>
  );
}
