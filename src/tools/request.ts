import type { AxiosRequestConfig } from "axios";
import { HttpProxyAgent } from "http-proxy-agent";
import { HttpsProxyAgent } from "https-proxy-agent";
import { resolveCliConfig } from "../public/config";

/**
 * Builds axios proxy agents from CLI flags, project config, or environment variables.
 */
export function getRequestProxy(
  httpProxy?: string,
  httpsProxy?: string,
): Pick<AxiosRequestConfig, "httpAgent" | "httpsAgent" | "proxy"> {
  const config = resolveCliConfig();
  const httpProxyURL =
    httpProxy ||
    config.httpProxy ||
    config.proxy ||
    process.env.HTTP_PROXY ||
    process.env.http_proxy;
  const httpsProxyURL =
    httpsProxy ||
    config.httpsProxy ||
    config.proxy ||
    config.httpProxy ||
    process.env.HTTPS_PROXY ||
    process.env.https_proxy ||
    httpProxyURL;

  return {
    httpAgent: httpProxyURL ? new HttpProxyAgent(httpProxyURL) : undefined,
    httpsAgent: httpsProxyURL ? new HttpsProxyAgent(httpsProxyURL) : undefined,
    proxy: false,
  };
}
