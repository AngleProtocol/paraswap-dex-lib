import Web3Abi, { AbiCoder } from 'web3-eth-abi';
import { JsonRpcProvider } from '@ethersproject/providers';
import { Interface } from '@ethersproject/abi';
import { IDex } from './idex';
import {
  Address,
  NumberAsString,
  AdapterExchangeParam,
  SimpleExchangeParam,
  TxInfo,
} from '../types';
import { SwapSide, ETHER_ADDRESS } from '../constants';
import { SimpleExchange } from './simple-exchange';
import UniswapV2RouterABI from '../abi/UniswapV2Router.json';
import UniswapV2ExchangeRouterABI from '../abi/UniswapV2ExchangeRouter.json';


type UniswapData = {
  router: Address;
  path: Address[];
  factory: Address;
  initCode: string;
};

type SwapOnUniswapParam = [
  amountIn: NumberAsString,
  amountOutMin: NumberAsString,
  path: Address[],
];

type BuyOnUniswapParam = [
  amountInMax: NumberAsString,
  amountOut: NumberAsString,
  path: Address[],
];

type UniswapParam = SwapOnUniswapParam | BuyOnUniswapParam;

const directUniswapFunctionName = {sell: 'swapOnUniswap', buy: 'buyOnUniswap'};

export class UniswapV2
  extends SimpleExchange
  implements IDex<UniswapData, UniswapParam>
{
  routerInterface: Interface;
  exchangeRouterInterface: Interface;
  abiCoder: AbiCoder;

  constructor(
    augustusAddress: Address,
    network: number, 
    provider: JsonRpcProvider,
    protected dexKey = 'uniswapv2',
    protected directFunctionName = directUniswapFunctionName) {
    super(augustusAddress);
    this.routerInterface = new Interface(UniswapV2RouterABI);
    this.exchangeRouterInterface = new Interface(UniswapV2ExchangeRouterABI);
    this.abiCoder = (Web3Abi as unknown) as AbiCoder;
  }

  protected fixPath(path: Address[], srcToken: Address, destToken: Address) {
    return path.map((token: string, i: number) => {
      if (
        (i === 0 && srcToken.toLowerCase() === ETHER_ADDRESS.toLowerCase()) ||
        (i === path.length - 1 &&
          destToken.toLowerCase() === ETHER_ADDRESS.toLowerCase())
      )
        return ETHER_ADDRESS;
      return token;
    });
  }

  getAdapterParam(
    srcToken: Address,
    destToken: Address,
    srcAmount: NumberAsString,
    toAmount: NumberAsString, // required for buy case
    data: UniswapData,
    side: SwapSide,
  ): AdapterExchangeParam {
    const path = this.fixPath(data.path, srcToken, destToken);
    const payload = this.abiCoder.encodeParameter(
      {
        ParentStruct: {
          path: 'address[]',
        },
      },
      { path },
    );
    return {
      targetExchange: data.router,
      payload,
      networkFee: '0',
    };
  }

  getSimpleParam(
    src: Address,
    dest: Address,
    srcAmount: NumberAsString,
    destAmount: NumberAsString,
    data: UniswapData,
    side: SwapSide,
  ): SimpleExchangeParam {
    const path = this.fixPath(data.path, src, dest);
    const swapData = this.exchangeRouterInterface.encodeFunctionData(
      side === SwapSide.SELL ? 'swap' : 'buy',
      [srcAmount, destAmount, path],
    );
    return this.buildSimpleParamWithoutWETHConversion(
      src,
      srcAmount,
      dest,
      destAmount,
      swapData,
      data.router,
    );
  }

  getDirectParam(
    srcToken: Address,
    destToken: Address,
    srcAmount: NumberAsString,
    destAmount: NumberAsString,
    data: UniswapData,
    side: SwapSide,
  ): TxInfo<UniswapParam> {
    const path = this.fixPath(data.path, srcToken, destToken);
    const encoder = (...params: UniswapParam) =>
      this.routerInterface.encodeFunctionData(
        side === SwapSide.SELL ? 'swapOnUniswap' : 'buyOnUniswap',
        params,
      );
    return {
      params: [srcAmount, destAmount, path],
      encoder,
      networkFee: '0',
    };
  }

  getDEXKey(): string {
    return this.dexKey;
  }

  getDirectFuctionName(): {sell?: string, buy?: string} {
    return this.directFunctionName;
  }
}