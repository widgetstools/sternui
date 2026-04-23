import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import * as Notifications from "@openfin/notifications";
import { useEffect, useState } from "react";
import { Button } from "../components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "../components/ui/card";
function View1() {
    const [notificationActionMessage, setNotificationActionMessage] = useState("");
    useEffect(() => {
        let handler;
        Notifications.register().then(() => {
            handler = (event) => {
                console.log("Notification clicked:", event.result["customData"]);
                setNotificationActionMessage(event.result["customData"]);
            };
            Notifications.addEventListener("notification-action", handler);
        }).catch((err) => {
            console.warn("Notifications registration failed:", err);
        });
        return () => {
            if (handler) {
                Notifications.removeEventListener("notification-action", handler);
            }
        };
    }, []);
    async function showNotification() {
        if (typeof fin === "undefined")
            return;
        await Notifications.create({
            platform: fin.me.identity.uuid,
            title: "Simple Notification",
            body: "This is a simple notification",
            toast: "transient",
            buttons: [
                {
                    title: "Click me",
                    type: "button",
                    cta: true,
                    onClick: {
                        customData: "custom notification data",
                    },
                },
            ],
        });
    }
    async function broadcastFDC3Context() {
        if (typeof fdc3 === "undefined")
            return;
        await fdc3.broadcast({
            type: "fdc3.instrument",
            name: "Microsoft Corporation",
            id: {
                ticker: "MSFT",
            },
        });
    }
    async function broadcastFDC3ContextAppChannel() {
        if (typeof fdc3 === "undefined")
            return;
        const appChannel = await fdc3.getOrCreateChannel("CUSTOM-APP-CHANNEL");
        await appChannel.broadcast({
            type: "fdc3.instrument",
            name: "Apple Inc.",
            id: {
                ticker: "AAPL",
            },
        });
    }
    return (_jsxs("div", { className: "flex flex-col flex-1 gap-5", children: [_jsx("header", { className: "flex flex-row justify-between items-center", children: _jsxs("div", { className: "flex flex-col", children: [_jsx("h1", { className: "text-xl font-bold", children: "OpenFin React View 1" }), _jsx("p", { className: "text-sm text-muted-foreground", children: "React app view in an OpenFin workspace" })] }) }), _jsx("main", { children: _jsxs(Card, { children: [_jsxs(CardHeader, { children: [_jsx(CardTitle, { children: "Workspace Features" }), _jsx(CardDescription, { children: "Notifications and FDC3 broadcasting" })] }), _jsxs(CardContent, { className: "flex flex-col gap-2", children: [_jsx(Button, { onClick: () => showNotification(), children: "Show Notification" }), _jsx(Button, { variant: "secondary", onClick: () => broadcastFDC3Context(), children: "Broadcast FDC3 Context" }), _jsx(Button, { variant: "outline", onClick: () => broadcastFDC3ContextAppChannel(), children: "Broadcast FDC3 Context on App Channel" }), notificationActionMessage && (_jsxs("p", { className: "text-sm text-muted-foreground", children: ["Notification action: ", notificationActionMessage] }))] })] }) })] }));
}
export default View1;
//# sourceMappingURL=View1.js.map