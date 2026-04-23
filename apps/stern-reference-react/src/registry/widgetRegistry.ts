import { WidgetRegistry } from '@marketsui/widget-sdk';
import { SimpleBlotter } from '@marketsui/widgets-react';

/**
 * Widget registry — maps widget type strings to React components.
 * The reference app registers all available widgets here.
 */
export const widgetRegistry = new WidgetRegistry();

widgetRegistry.register('simple-blotter', SimpleBlotter);
