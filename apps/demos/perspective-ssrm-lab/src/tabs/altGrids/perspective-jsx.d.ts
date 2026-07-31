import type { DetailedHTMLProps, HTMLAttributes } from 'react';

type PerspectiveViewerProps = DetailedHTMLProps<
  HTMLAttributes<HTMLElement>,
  HTMLElement
> & {
  theme?: string;
};

declare module 'react' {
  namespace JSX {
    interface IntrinsicElements {
      'perspective-viewer': PerspectiveViewerProps;
    }
  }
}

export {};
