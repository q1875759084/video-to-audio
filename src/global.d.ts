// CSS Modules 类型声明
// TypeScript 不原生识别 .scss/.css 模块，此声明让 import styles from '*.module.scss' 不报错
declare module '*.module.scss' {
  const classes: Record<string, string>;
  export default classes;
}

declare module '*.module.css' {
  const classes: Record<string, string>;
  export default classes;
}
