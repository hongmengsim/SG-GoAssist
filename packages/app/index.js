import { registerRootComponent } from "expo";
import App from "./App";

if (typeof document !== "undefined") {
  document.title = "SG GoAssist";
}

registerRootComponent(App);
