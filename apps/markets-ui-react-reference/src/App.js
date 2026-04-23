import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "./components/ui/card";
function App() {
    return (_jsxs("div", { className: "flex flex-col flex-1 gap-5", children: [_jsx("header", { className: "flex flex-row justify-between items-center", children: _jsxs("div", { className: "flex flex-col", children: [_jsx("h1", { className: "text-xl font-bold", children: "OpenFin React" }), _jsx("p", { className: "text-sm text-muted-foreground", children: "Example demonstrating running a React app in an OpenFin workspace" })] }) }), _jsx("main", { className: "flex flex-col gap-2.5", children: _jsxs(Card, { children: [_jsxs(CardHeader, { children: [_jsx(CardTitle, { children: "Getting Started" }), _jsx(CardDescription, { children: "Launch this application in the OpenFin container" })] }), _jsxs(CardContent, { children: [_jsx("p", { children: "To launch this application in the OpenFin container, run the following command:" }), _jsx("pre", { className: "mt-2 rounded-md bg-muted p-3 font-mono text-sm", children: "npm run client" })] })] }) })] }));
}
export default App;
//# sourceMappingURL=App.js.map