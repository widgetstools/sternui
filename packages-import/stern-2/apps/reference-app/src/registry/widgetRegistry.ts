import { WidgetRegistry } from '@stern/widget-sdk';
import { SimpleBlotter } from '@stern/widgets';

/**
 * Widget registry — maps widget type strings to React components.
 * The reference app registers all available widgets here.
 */
export const widgetRegistry = new WidgetRegistry();

widgetRegistry.register('simple-blotter', SimpleBlotter);
