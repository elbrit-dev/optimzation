import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // transpilePackages: [
  //   'antd',
  //   '@ant-design/icons',
  //   '@ant-design/icons-svg',
  //   'rc-pagination',
  //   'rc-picker',
  //   'rc-util',
  //   'rc-tree',
  //   'rc-table',
  //   '@rc-component/util',
  //   '@rc-component/mutate-observer'
  // ],
  typescript: {
    ignoreBuildErrors: true,
  },
  // Since Next.js 16 uses Turbopack by default, we need to explicitly allow webpack or migrate aliases.
  // Adding an empty turbopack object silences the warning when webpack is also used.
  turbopack: {},
  webpack: (config) => {
    config.resolve.alias['../shared/components/src/components'] = path.resolve(__dirname, 'components/DataTable');
    return config;
  },
};

export default nextConfig;
