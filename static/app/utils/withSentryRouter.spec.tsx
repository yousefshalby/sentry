import {OrganizationFixture} from 'sentry-fixture/organization';

import {initializeOrg} from 'sentry-test/initializeOrg';
import {render, screen} from 'sentry-test/reactTestingLibrary';

import type {WithRouterProps} from 'sentry/types/legacyReactRouter';
// eslint-disable-next-line no-restricted-imports
import withSentryRouter from 'sentry/utils/withSentryRouter';

const mockUsingCustomerDomain = jest.fn();
const mockCustomerDomain = jest.fn();

jest.mock('sentry/constants', () => {
  const sentryConstant = jest.requireActual('sentry/constants');
  return {
    ...sentryConstant,

    get usingCustomerDomain() {
      return mockUsingCustomerDomain();
    },

    get customerDomain() {
      return mockCustomerDomain();
    },
  };
});

describe('withSentryRouter', function () {
  type Props = WithRouterProps<{orgId: string}>;
  function MyComponent(props: Props) {
    const {params} = props;
    return <div>Org slug: {params.orgId ?? 'no org slug'}</div>;
  }

  it('injects orgId when a customer domain is being used', function () {
    mockUsingCustomerDomain.mockReturnValue(true);
    mockCustomerDomain.mockReturnValue('albertos-apples');

    const organization = OrganizationFixture({
      slug: 'albertos-apples',
      features: [],
    });

    const {router} = initializeOrg({
      organization,
    });

    const WrappedComponent = withSentryRouter(MyComponent);
    render(<WrappedComponent />, {
      router,
      deprecatedRouterMocks: true,
    });

    expect(screen.getByText('Org slug: albertos-apples')).toBeInTheDocument();
  });

  it('does not inject orgId when a customer domain is not being used', function () {
    mockUsingCustomerDomain.mockReturnValue(false);
    mockCustomerDomain.mockReturnValue(undefined);

    const organization = OrganizationFixture({
      slug: 'albertos-apples',
      features: [],
    });

    const params = {
      orgId: 'something-else',
    };
    const {router} = initializeOrg({
      organization,
      router: {
        params,
      },
    });

    const WrappedComponent = withSentryRouter(MyComponent);
    render(<WrappedComponent />, {
      router,
      deprecatedRouterMocks: true,
    });

    expect(screen.getByText('Org slug: something-else')).toBeInTheDocument();
  });
});
