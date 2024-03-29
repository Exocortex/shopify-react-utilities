/* eslint-disable camelcase, no-process-env */

import * as React from 'react';
import {
  unmountComponentAtNode,
  unstable_renderSubtreeIntoContainer,
} from 'react-dom';

import {ReactComponent} from './types';
import {isServer} from './target';

const {isValidElement, Children} = React;

export function FirstChild(props: {children?: React.ReactNode}) {
  const childrenArray = React.Children.toArray(props.children);
  return childrenArray[0] || null;
}

export function getDisplayName(Component: ReactComponent<any>) {
  return (
    Component.displayName ||
    (Component as React.StatelessComponent<any>).name ||
    'Component'
  );
}

// Wraps `element` in `Component`, if it is not already an instance of
// `Component`. If `props` is passed, those will be added as props on the
// wrapped component. If `element` is null, the component is not wrapped.
export function wrapWithComponent<P>(
  element: React.ReactNode | null | undefined,
  Component: ReactComponent<P>,
  props?: Partial<P>,
): React.ReactNode {
  if (element == null) {
    return null;
  }
  return isElementOfType(element, Component) ? (
    (element as React.ReactElement<P>)
  ) : (
    <Component {...props}>{element}</Component>
  );
}

function hotReloadComponentCheck(
  AComponent: ReactComponent<any>,
  AnotherComponent: ReactComponent<any>,
) {
  const componentName = AComponent.name;
  const anotherComponentName = (AnotherComponent as React.StatelessComponent<
    any
  >).displayName;

  return (
    AComponent === AnotherComponent ||
    (Boolean(componentName) && componentName === anotherComponentName)
  );
}

// In development, we compare based on the name of the function because
// React Hot Loader proxies React components in order to make updates. In
// production we can simply compare the components for equality.
const isComponent =
  process.env.NODE_ENV === 'development'
    ? hotReloadComponentCheck
    : (
        AComponent: ReactComponent<any>,
        AnotherComponent: ReactComponent<any>,
      ) => AComponent === AnotherComponent;

// Checks whether `element` is a React element of type `Component` (or one of
// the passed components, if `Component` is an array of React components).
export function isElementOfType(
  element: React.ReactNode | null | undefined,
  Component: ReactComponent<{}> | ReactComponent<{}>[],
): boolean {
  if (
    element == null ||
    !isValidElement(element) ||
    typeof element.type === 'string'
  ) {
    return false;
  }

  const {type} = element;
  const Components = Array.isArray(Component) ? Component : [Component];

  return Components.some(
    (AComponent) => typeof type !== 'string' && isComponent(AComponent, type),
  );
}

// Returns all children that are valid elements as an array. Can optionally be
// filtered by passing `predicate`.
export function elementChildren<T extends React.ReactElement<{}>>(
  children: React.ReactNode,
  predicate: ((element: T) => boolean) = () => true,
): T[] {
  return Children.toArray(children).filter(
    (child) => isValidElement(child) && predicate(child as T),
  ) as T[];
}

// Adds the `methods` to the prototype of `Component`, with any existing
// methods of the same name still being called *after* they version supplied
// by `methods`. Returns the newly-augmented class.
export function augmentComponent<
  P,
  C extends React.ComponentClass<P>,
  M extends {[key: string]: (...args: any[]) => any},
  O extends C & {new (): M}
>(Component: C, methods: M): O {
  Object.keys(methods).forEach((name) => {
    const method = methods[name];

    if (typeof method !== 'function') {
      return;
    }

    const currentMethod = Component.prototype[name];

    Component.prototype[name] = function(...args: any[]) {
      if (typeof currentMethod === 'function') {
        currentMethod.call(this, ...args);
      }

      method.call(this, ...args);
    };
  });

  return Component as O;
}

let layerIndex = 1;

// Creates a decorator for a component that will render a layer into a detached
// DOM node. This is useful for creating things outside of the normal React
// hierarchy, such as modals and popovers. This function accepts an `options`
// object. Currently, the only option is `idPrefix`, which specifies a prefix
// for the unique ID of the detached nodes.
//
// The returned decorator can only be applied to a React component that has a
// `renderLayer()` method, which should return the React element to render into
// the detached DOM node.
export interface LayerRenderable {
  new (...args: any[]): LayerRenderableInstance;
}

export interface LayerRenderableInstance {
  renderLayer(): React.ReactNode;
}

export interface LayeredComponent {
  layerNode?: HTMLDivElement;
  layerOutput?: React.ReactNode;
}

export function layeredComponent(options: {idPrefix?: string} = {}) {
  function uniqueID() {
    const {idPrefix} = options;
    return `${idPrefix}Layer${layerIndex++}`;
  }

  return function createLayeredComponent<
    P,
    C extends React.ComponentClass<P> & LayerRenderable
  >(Component: C): C & LayeredComponent {
    return augmentComponent(Component, {
      componentWillMount() {
        if (isServer) {
          return;
        }
        const node = document.createElement('div');
        node.id = uniqueID();

        this.layerNode = node;
      },

      componentDidMount() {
        if (isServer) {
          return;
        }

        document.body.appendChild(this.layerNode);

        this.renderLayerToNode();
      },

      componentDidUpdate() {
        if (isServer) {
          return;
        }

        this.renderLayerToNode();
      },

      renderLayerToNode() {
        if (isServer) {
          return;
        }
        const layerOutput = this.renderLayer() || <span />;
        this.layerOutput = layerOutput;
        unstable_renderSubtreeIntoContainer(this, layerOutput, this.layerNode);
      },

      componentWillUnmount() {
        if (isServer) {
          return;
        }

        const {layerNode} = this;

        unmountComponentAtNode(layerNode);
        document.body.removeChild(layerNode);
      },
    });
  };
}
