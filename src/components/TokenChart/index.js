import React, { useState, useRef, useEffect } from 'react'
import styled from 'styled-components'
import { Area, XAxis, YAxis, ResponsiveContainer, Tooltip, AreaChart, BarChart, Bar } from 'recharts'
import { AutoRow, RowBetween, RowFixed } from '../Row'

import { toK, toNiceDate, toNiceDateYear, formattedNum, getTimeframe } from '../../utils'
import { OptionButton } from '../ButtonStyled'
import { darken } from 'polished'
import { useMedia, usePrevious } from 'react-use'
import { timeframeOptions } from '../../constants'
import { useTokenChartData, useTokenPriceData } from '../../contexts/TokenData'
import DropdownSelect from '../DropdownSelect'
import CandleStickChart from '../CandleChart'
import LocalLoader from '../LocalLoader'
import { AutoColumn } from '../Column'
import { Activity } from 'react-feather'
import { useDarkModeManager } from '../../contexts/LocalStorage'
import { fetchAPI } from '../../contexts/API'
import Chart from "chart.js/auto"
import 'chartjs-adapter-moment';

const ChartWrapper = styled.div`
  height: 100%;
  min-height: 300px;

  @media screen and (max-width: 600px) {
    min-height: 200px;
  }
`

const PriceOption = styled(OptionButton)`
  border-radius: 2px;
`

const CHART_VIEW = {
  VOLUME: 'Volume',
  LIQUIDITY: 'Liquidity',
  PRICE: 'Price',
  LINE_PRICE: 'Price (Line)'
}

const DATA_FREQUENCY = {
  DAY: 'DAY',
  HOUR: 'HOUR',
  LINE: 'LINE'
}

const DENOMINATIONS = {
  USD: 'USD',
  ETH: 'ETH',
  BNB: 'BNB',
  TokensUSD: 'Tokens(USD)',
  Tokens: 'Tokens',
  //BTC: 'BTC'
}

function random255() {
  return Math.round(Math.random() * 255)
}

const ALL_CHAINS = "All chains"
const TokenChart = ({ color, base, data, tokens, tokensInUsd, chainTvls }) => {
  // settings for the window and candle width
  const [chartFilter, setChartFilter] = useState(CHART_VIEW.LIQUIDITY)
  const [frequency, setFrequency] = useState(DATA_FREQUENCY.HOUR)
  const [denomination, setDenomination] = useState(DENOMINATIONS.USD)
  const [balanceToken, setBalanceToken] = useState(undefined)
  const [denominationPriceHistory, setDenominationPriceHistory] = useState(undefined)
  const [stackedChart, setStackedChart] = useState(undefined)
  const [selectedChain, setSelectedChain] = useState(ALL_CHAINS)

  const [darkMode] = useDarkModeManager()
  const textColor = darkMode ? 'white' : 'black'

  let chartData = data;
  if (selectedChain !== ALL_CHAINS) {
    chartData = chainTvls[selectedChain].tvl;
    base = chartData[chartData.length - 1].totalLiquidityUSD;
    tokens = chainTvls[selectedChain].tokens;
    tokensInUsd = chainTvls[selectedChain].tokensInUsd
  }
  useEffect(() => {
    setDenomination(DENOMINATIONS.USD)
    setBalanceToken(undefined)
  }, [selectedChain])


  const [timeWindow, setTimeWindow] = useState(timeframeOptions.ALL_TIME)
  const prevWindow = usePrevious(timeWindow)


  const priceData = undefined

  // switch to hourly data when switched to week window
  useEffect(() => {
    if (timeWindow === timeframeOptions.WEEK && prevWindow && prevWindow !== timeframeOptions.WEEK) {
      setFrequency(DATA_FREQUENCY.HOUR)
    }
  }, [prevWindow, timeWindow])

  // switch to daily data if switche to month or all time view
  useEffect(() => {
    if (timeWindow === timeframeOptions.MONTH && prevWindow && prevWindow !== timeframeOptions.MONTH) {
      setFrequency(DATA_FREQUENCY.DAY)
    }
    if (timeWindow === timeframeOptions.ALL_TIME && prevWindow && prevWindow !== timeframeOptions.ALL_TIME) {
      setFrequency(DATA_FREQUENCY.DAY)
    }
  }, [prevWindow, timeWindow])

  const below1080 = useMedia('(max-width: 1080px)')
  const below600 = useMedia('(max-width: 600px)')

  let utcStartTime = getTimeframe(timeWindow)
  const domain = [dataMin => (dataMin > utcStartTime ? dataMin : utcStartTime), 'dataMax']
  const aspect = below1080 ? 60 / 32 : below600 ? 60 / 42 : 60 / 22

  useEffect(() => {
    if ((denomination === DENOMINATIONS.ETH || denomination === DENOMINATIONS.BNB) && (denominationPriceHistory === undefined || denominationPriceHistory.asset !== denomination)) {
      fetchAPI(`https://api.coingecko.com/api/v3/coins/${denomination === DENOMINATIONS.ETH ? 'ethereum' : 'binancecoin'}/market_chart/range?vs_currency=usd&from=${utcStartTime}&to=${Math.floor(Date.now() / 1000)}`).then(data => setDenominationPriceHistory({
        asset: denomination,
        prices: data.prices
      }))
    } else if (denomination === DENOMINATIONS.TokensUSD) {
      if (stackedChart !== undefined) {
        stackedChart.destroy();
      }
      const labels = []
      const datasets = {}
      const tokenBalances = tokensInUsd;
      tokenBalances.forEach((snapshot, index) => {
        labels.push(snapshot.date * 1000);
        Object.entries(snapshot.tokens).forEach(([symbol, tvl]) => {
          if (datasets[symbol] === undefined) {
            const color = `rgb(${random255()}, ${random255()}, ${random255()})`
            datasets[symbol] = {
              label: symbol,
              backgroundColor: color,
              borderColor: color,
              data: new Array(index).fill(0),
              fill: true
            }
          }
          datasets[symbol].data.push(tvl)
        })
      })
      const data = {
        labels: labels,
        datasets: Object.values(datasets)
      };
      const config = {
        type: 'line',
        data: data,
        options: {
          responsive: true,
          plugins: {
            tooltip: {
              mode: 'index'
            },
          },
          interaction: {
            mode: 'nearest',
            axis: 'x',
            intersect: false
          },
          scales: {
            x: {
              type: 'time',
            },
            y: {
              stacked: true,
              title: {
                display: true,
                text: denomination === DENOMINATIONS.Tokens ? 'Balance' : 'USD'
              }
            }
          }
        }
      };
      const chart = new Chart(
        document.getElementById('stackedChart'),
        config
      );
      setStackedChart(chart)
    }
  }, [denomination])

  chartData = chartData?.filter(entry => entry.date >= utcStartTime)
  if (denomination === DENOMINATIONS.ETH || denomination === DENOMINATIONS.BNB) {
    if (denominationPriceHistory !== undefined && denominationPriceHistory.asset === denomination) {
      let priceIndex = 0;
      let prevPriceDate = 0
      const denominationPrices = denominationPriceHistory.prices;
      for (let i = 0; i < chartData.length; i++) {
        const date = chartData[i].date * 1000;
        while (priceIndex < denominationPrices.length && Math.abs(date - prevPriceDate) > Math.abs(date - denominationPrices[priceIndex][0])) {
          prevPriceDate = denominationPrices[priceIndex][0];
          priceIndex++;
        }
        const price = denominationPrices[priceIndex - 1][1];
        //console.log(join(new Date(date), a, '-'), price, chartData[i].totalLiquidityUSD, chartData[i].totalLiquidityUSD / price)
        chartData[i] = {
          date: chartData[i].date,
          totalLiquidityUSD: chartData[i].totalLiquidityUSD / price
        }
      }
    } else {
      chartData = undefined
    }
  }
  if (denomination === DENOMINATIONS.Tokens) {
    chartData = [];
    tokens.forEach(tokenSnapshot => {
      chartData.push({
        date: tokenSnapshot.date,
        totalLiquidityUSD: tokenSnapshot.tokens[balanceToken] ?? 0
      })
    })
  }

  // update the width on a window resize
  const ref = useRef()
  const isClient = typeof window === 'object'
  const [width, setWidth] = useState(ref?.current?.container?.clientWidth)
  useEffect(() => {
    if (!isClient) {
      return false
    }
    function handleResize() {
      setWidth(ref?.current?.container?.clientWidth ?? width)
    }
    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, [isClient, width]) // Empty array ensures that effect is only run on mount and unmount

  let moneySymbol = '$';
  switch (denomination) {
    case DENOMINATIONS.ETH:
      moneySymbol = 'Ξ';
      break;
    case DENOMINATIONS.BNB:
      moneySymbol = 'B';
      break;
    case DENOMINATIONS.Tokens:
      moneySymbol = '';
      break;
  }

  const tokensProvided = tokensInUsd !== undefined && tokensInUsd.length !== 0 && !tokensInUsd.some(data => !data.tokens)
  const denominationsToDisplay = {
    USD: 'USD',
    ETH: 'ETH',
    BNB: 'BNB'
  };
  if (tokensProvided) {
    denominationsToDisplay['TokensUSD'] = 'Tokens(USD)';
  }
  const displayStackedChart = denomination === DENOMINATIONS.TokensUSD
  const displayTimeFrameOptions = denomination !== DENOMINATIONS.Tokens && denomination !== DENOMINATIONS.TokensUSD
  const tokenSymbols = tokensProvided ? Object.entries(tokensInUsd[tokensInUsd.length - 1].tokens).sort((a, b) => b[1] - a[1]).map(t => t[0]) : undefined
  return (
    <ChartWrapper>
      {below600 ? (
        <RowBetween mb={40}>
          <DropdownSelect options={denominationsToDisplay} active={denomination} setActive={setDenomination} color={color} />
          {displayTimeFrameOptions && <DropdownSelect options={timeframeOptions} active={timeWindow} setActive={setTimeWindow} color={color} />}
        </RowBetween>
      ) : (
        <RowBetween
          mb={
            chartFilter === CHART_VIEW.LIQUIDITY ||
              chartFilter === CHART_VIEW.VOLUME ||
              (chartFilter === CHART_VIEW.PRICE && frequency === DATA_FREQUENCY.LINE)
              ? 40
              : 0
          }
          align="flex-start"
        >
          <AutoColumn gap="8px">
            <RowFixed>
              {Object.values(denominationsToDisplay).map(option => <OptionButton
                active={denomination === option}
                onClick={() => setDenomination(option)}
                style={{ marginRight: '6px' }}
                key={option}
              >
                {option}
              </OptionButton>
              )}
              {tokenSymbols && <DropdownSelect options={tokenSymbols} active={denomination === DENOMINATIONS.Tokens ? balanceToken : 'Tokens'} setActive={(token) => {
                setBalanceToken(token);
                setDenomination(DENOMINATIONS.Tokens)
              }} color={color} style={{ marginRight: '6px' }} />}
              {chainTvls && Object.keys(chainTvls).length > 1 && <DropdownSelect options={[ALL_CHAINS].concat(Object.keys(chainTvls))} active={selectedChain} setActive={(chain) => {
                setSelectedChain(chain)
              }} color={color} />}
            </RowFixed>
            {chartFilter === CHART_VIEW.PRICE && (
              <AutoRow gap="4px">
                <PriceOption
                  active={frequency === DATA_FREQUENCY.DAY}
                  onClick={() => {
                    setTimeWindow(timeframeOptions.MONTH)
                    setFrequency(DATA_FREQUENCY.DAY)
                  }}
                >
                  D
                </PriceOption>
                <PriceOption
                  active={frequency === DATA_FREQUENCY.HOUR}
                  onClick={() => setFrequency(DATA_FREQUENCY.HOUR)}
                >
                  H
                </PriceOption>
                <PriceOption
                  active={frequency === DATA_FREQUENCY.LINE}
                  onClick={() => setFrequency(DATA_FREQUENCY.LINE)}
                >
                  <Activity size={14} />
                </PriceOption>
              </AutoRow>
            )}
          </AutoColumn>
          {displayTimeFrameOptions &&
            <AutoRow justify="flex-end" gap="6px" align="flex-start">
              <OptionButton
                active={timeWindow === timeframeOptions.WEEK}
                onClick={() => setTimeWindow(timeframeOptions.WEEK)}
              >
                1W
            </OptionButton>
              <OptionButton
                active={timeWindow === timeframeOptions.MONTH}
                onClick={() => setTimeWindow(timeframeOptions.MONTH)}
              >
                1M
            </OptionButton>
              <OptionButton
                active={timeWindow === timeframeOptions.ALL_TIME}
                onClick={() => setTimeWindow(timeframeOptions.ALL_TIME)}
              >
                All
            </OptionButton>
            </AutoRow>
          }
        </RowBetween>
      )}
      {chartData === undefined && <LocalLoader />}
      {chartFilter === CHART_VIEW.LIQUIDITY && chartData && (
        <ResponsiveContainer aspect={aspect}>
          {displayStackedChart ? <canvas id="stackedChart"></canvas> :
            <AreaChart margin={{ top: 0, right: 10, bottom: 6, left: 0 }} barCategoryGap={1} data={chartData}>
              <defs>
                <linearGradient id="colorUv" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor={color} stopOpacity={0.35} />
                  <stop offset="95%" stopColor={color} stopOpacity={0} />
                </linearGradient>
              </defs>
              <XAxis
                tickLine={false}
                axisLine={false}
                interval="preserveEnd"
                tickMargin={16}
                minTickGap={120}
                tickFormatter={tick => toNiceDate(tick)}
                dataKey="date"
                tick={{ fill: textColor }}
                type={'number'}
                domain={['dataMin', 'dataMax']}
              />
              <YAxis
                type="number"
                orientation="right"
                tickFormatter={tick => moneySymbol + toK(tick)}
                axisLine={false}
                tickLine={false}
                interval="preserveEnd"
                minTickGap={80}
                yAxisId={0}
                tick={{ fill: textColor }}
              />
              <Tooltip
                cursor={true}
                formatter={val => formattedNum(val, moneySymbol === '$')}
                labelFormatter={label => toNiceDateYear(label)}
                labelStyle={{ paddingTop: 4 }}
                contentStyle={{
                  padding: '10px 14px',
                  borderRadius: 10,
                  borderColor: color,
                  color: 'black'
                }}
                wrapperStyle={{ top: -70, left: -10 }}
              />
              <Area
                key={'other'}
                dataKey={'totalLiquidityUSD'}
                stackId="2"
                strokeWidth={2}
                dot={false}
                type="monotone"
                name={'TVL'}
                yAxisId={0}
                stroke={color}
                fill="url(#colorUv)"
              />
            </AreaChart>
          }
        </ResponsiveContainer>
      )
      }
      {
        chartFilter === CHART_VIEW.PRICE &&
        (frequency === DATA_FREQUENCY.LINE ? (
          <ResponsiveContainer aspect={below1080 ? 60 / 32 : 60 / 16}>
            <AreaChart margin={{ top: 0, right: 10, bottom: 6, left: 0 }} barCategoryGap={1} data={chartData}>
              <defs>
                <linearGradient id="colorUv" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor={color} stopOpacity={0.35} />
                  <stop offset="95%" stopColor={color} stopOpacity={0} />
                </linearGradient>
              </defs>
              <XAxis
                tickLine={false}
                axisLine={false}
                interval="preserveEnd"
                tickMargin={16}
                minTickGap={120}
                tickFormatter={tick => toNiceDate(tick)}
                dataKey="date"
                tick={{ fill: textColor }}
                type={'number'}
                domain={domain}
              />
              <YAxis
                type="number"
                orientation="right"
                tickFormatter={tick => moneySymbol + toK(tick)}
                axisLine={false}
                tickLine={false}
                interval="preserveEnd"
                minTickGap={80}
                yAxisId={0}
                tick={{ fill: textColor }}
              />
              <Tooltip
                cursor={true}
                formatter={val => formattedNum(val, true)}
                labelFormatter={label => toNiceDateYear(label)}
                labelStyle={{ paddingTop: 4 }}
                contentStyle={{
                  padding: '10px 14px',
                  borderRadius: 10,
                  borderColor: color,
                  color: 'black'
                }}
                wrapperStyle={{ top: -70, left: -10 }}
              />
              <Area
                key={'other'}
                dataKey={'priceUSD'}
                stackId="2"
                strokeWidth={2}
                dot={false}
                type="monotone"
                name={'Price'}
                yAxisId={0}
                stroke={darken(0.12, color)}
                fill="url(#colorUv)"
              />
            </AreaChart>
          </ResponsiveContainer>
        ) : priceData ? (
          <ResponsiveContainer aspect={aspect} ref={ref}>
            <CandleStickChart data={priceData} width={width} base={base} />
          </ResponsiveContainer>
        ) : (
          <LocalLoader />
        ))
      }

      {
        chartFilter === CHART_VIEW.VOLUME && (
          <ResponsiveContainer aspect={aspect}>
            <BarChart margin={{ top: 0, right: 10, bottom: 6, left: 10 }} barCategoryGap={1} data={chartData}>
              <XAxis
                tickLine={false}
                axisLine={false}
                interval="preserveEnd"
                minTickGap={80}
                tickMargin={14}
                tickFormatter={tick => toNiceDate(tick)}
                dataKey="date"
                tick={{ fill: textColor }}
                type={'number'}
                domain={['dataMin', 'dataMax']}
              />
              <YAxis
                type="number"
                axisLine={false}
                tickMargin={16}
                tickFormatter={tick => moneySymbol + toK(tick)}
                tickLine={false}
                orientation="right"
                interval="preserveEnd"
                minTickGap={80}
                yAxisId={0}
                tick={{ fill: textColor }}
              />
              <Tooltip
                cursor={{ fill: color, opacity: 0.1 }}
                formatter={val => formattedNum(val, true)}
                labelFormatter={label => toNiceDateYear(label)}
                labelStyle={{ paddingTop: 4 }}
                contentStyle={{
                  padding: '10px 14px',
                  borderRadius: 10,
                  borderColor: color,
                  color: 'black'
                }}
                wrapperStyle={{ top: -70, left: -10 }}
              />
              <Bar
                type="monotone"
                name={'Volume'}
                dataKey={'dailyVolumeUSD'}
                fill={color}
                opacity={'0.4'}
                yAxisId={0}
                stroke={color}
              />
            </BarChart>
          </ResponsiveContainer>
        )
      }
    </ChartWrapper >
  )
}

export default TokenChart
