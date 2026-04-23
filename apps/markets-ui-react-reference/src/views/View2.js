import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useEffect, useRef, useState } from "react";
import { Button } from "../components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "../components/ui/card";
function View2() {
    const [message, setMessage] = useState("");
    const listenersRef = useRef([]);
    useEffect(() => {
        let cancelled = false;
        async function setupListeners() {
            if (typeof fdc3 === "undefined")
                return;
            // System channel listener
            const systemListener = await fdc3.addContextListener((context) => {
                if (!cancelled)
                    setMessage(JSON.stringify(context, undefined, "  "));
            });
            listenersRef.current.push(systemListener);
            // App channel listener
            const appChannel = await fdc3.getOrCreateChannel("CUSTOM-APP-CHANNEL");
            const appListener = await appChannel.addContextListener((context) => {
                if (!cancelled)
                    setMessage(JSON.stringify(context, undefined, "  "));
            });
            listenersRef.current.push(appListener);
        }
        setupListeners();
        return () => {
            cancelled = true;
            for (const listener of listenersRef.current) {
                listener.unsubscribe();
            }
            listenersRef.current = [];
        };
    }, []);
    return (_jsxs("div", { className: "flex flex-col flex-1 gap-5", children: [_jsx("header", { className: "flex flex-row justify-between items-center", children: _jsxs("div", { className: "flex flex-col", children: [_jsx("h1", { className: "text-xl font-bold", children: "OpenFin React View 2" }), _jsx("p", { className: "text-sm text-muted-foreground", children: "React app view in an OpenFin workspace" })] }) }), _jsx("main", { children: _jsxs(Card, { children: [_jsxs(CardHeader, { children: [_jsx(CardTitle, { children: "FDC3 Context Listener" }), _jsx(CardDescription, { children: "Receives broadcast context from View 1" })] }), _jsxs(CardContent, { className: "flex flex-col gap-2", children: [_jsx("pre", { className: "w-full min-h-[110px] rounded-md bg-muted p-3 font-mono text-sm", children: message }), _jsx(Button, { variant: "outline", onClick: () => setMessage(""), children: "Clear" })] })] }) })] }));
}
export default View2;
//# sourceMappingURL=View2.js.map