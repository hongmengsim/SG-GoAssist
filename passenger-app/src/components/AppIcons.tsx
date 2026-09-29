import React, { useContext } from "react";
import { Platform } from "react-native";
import {
  PassengerControlContext,
  usePresentationSizes,
} from "../accessibility/AccessibilityRuntime";
import {
  ArrowUp as ArrowUpBase,
  BookOpenCheck as BookOpenCheckBase,
  Bookmark as BookmarkBase,
  Camera as CameraBase,
  CameraOff as CameraOffBase,
  Check as CheckBase,
  CircleAlert as CircleAlertBase,
  ListChecks as ListChecksBase,
  Mic as MicBase,
  RotateCcw as RotateCcwBase,
  Send as SendBase,
  Share2 as Share2Base,
  ShieldAlert as ShieldAlertBase,
  Square as SquareBase,
  ThumbsDown as ThumbsDownBase,
  ThumbsUp as ThumbsUpBase,
  TriangleAlert as TriangleAlertBase,
  Umbrella as UmbrellaBase,
  X as XBase,
  Accessibility as AccessibilityBase,
  AudioLines as AudioLinesBase,
  ArrowLeft as ArrowLeftBase,
  ArrowRight as ArrowRightBase,
  BadgeCheck as BadgeCheckBase,
  Bell as BellBase,
  BellRing as BellRingBase,
  BusFront as BusFrontBase,
  Captions as CaptionsBase,
  ChevronDown as ChevronDownBase,
  ChevronUp as ChevronUpBase,
  CheckCircle2 as CheckCircle2Base,
  Circle as CircleBase,
  CircleCheck as CircleCheckBase,
  CircleHelp as CircleHelpBase,
  CircleQuestionMark as CircleQuestionMarkBase,
  CircleX as CircleXBase,
  Clock as ClockBase,
  Compass as CompassBase,
  Contrast as ContrastBase,
  DoorOpen as DoorOpenBase,
  Ear as EarBase,
  Eye as EyeBase,
  Footprints as FootprintsBase,
  Gauge as GaugeBase,
  Languages as LanguagesBase,
  List as ListBase,
  LocateFixed as LocateFixedBase,
  Map as MapBase,
  MapPinned as MapPinnedBase,
  MapPin as MapPinBase,
  MapPinCheck as MapPinCheckBase,
  MessageSquareText as MessageSquareTextBase,
  Mountain as MountainBase,
  Moon as MoonBase,
  Navigation as NavigationBase,
  RefreshCw as RefreshCwBase,
  Route as RouteBase,
  ScanText as ScanTextBase,
  Search as SearchBase,
  Settings as SettingsBase,
  ShieldCheck as ShieldCheckBase,
  SlidersHorizontal as SlidersHorizontalBase,
  Sun as SunBase,
  Timer as TimerBase,
  Touchpad as TouchpadBase,
  Type as TypeBase,
  Undo2 as Undo2Base,
  User as UserBase,
  Vibrate as VibrateBase,
  Volume2 as Volume2Base,
  type LucideIcon as NativeIcon,
} from "lucide-react-native";

type SafeIconProps = React.ComponentProps<NativeIcon> & {
  presentationRole?: "status" | "action" | "feature" | "detail";
  accessible?: boolean;
  accessibilityElementsHidden?: boolean;
  accessibilityHint?: string;
  accessibilityLabel?: string;
  accessibilityLiveRegion?: string;
  accessibilityRole?: string;
  accessibilityState?: unknown;
  accessibilityViewIsModal?: boolean;
  importantForAccessibility?: string;
};

/**
 * React Native accessibility props are valid on native SVGs but become unknown
 * DOM attributes on web. The surrounding labelled control owns semantics, so
 * strip those props at this single boundary before rendering the SVG.
 */
export type LucideIcon = React.ComponentType<SafeIconProps>;

function webSafe(Icon: NativeIcon, action = false): LucideIcon {
  const SafeIcon = ({
    presentationRole,
    accessible: _accessible,
    accessibilityElementsHidden: _accessibilityElementsHidden,
    accessibilityHint: _accessibilityHint,
    accessibilityLabel: _accessibilityLabel,
    accessibilityLiveRegion: _accessibilityLiveRegion,
    accessibilityRole: _accessibilityRole,
    accessibilityState: _accessibilityState,
    accessibilityViewIsModal: _accessibilityViewIsModal,
    importantForAccessibility: _importantForAccessibility,
    ...props
  }: SafeIconProps) => {
    const sizes = usePresentationSizes();
    const control = useContext(PassengerControlContext);
    const requested = typeof props.size === "number" ? props.size : 24;
    const role =
      presentationRole ??
      (requested >= 29
        ? "feature"
        : action || control || requested >= 24
          ? "action"
          : "status");
    const size =
      role === "detail"
        ? requested
        : role === "feature"
          ? Math.max(requested, sizes.featureIcon)
          : role === "action"
            ? sizes.actionIcon
            : sizes.statusIcon;
    return (
      <Icon
        {...props}
        size={size}
        strokeWidth={Math.max(
          Number(props.strokeWidth) || 0,
          sizes.strokeWidth,
        )}
        style={[props.style, { flexShrink: 0 }]}
        {...(Platform.OS === "web"
          ? {
              "data-presentation-icon": role,
              "aria-hidden": _accessibilityLabel ? undefined : true,
              "aria-label": _accessibilityLabel,
              role: _accessibilityLabel ? "img" : undefined,
            }
          : {
              accessible: _accessible ?? Boolean(_accessibilityLabel),
              accessibilityLabel: _accessibilityLabel,
              accessibilityElementsHidden:
                _accessibilityElementsHidden ?? !_accessibilityLabel,
              importantForAccessibility:
                _importantForAccessibility ??
                (_accessibilityLabel ? "yes" : "no"),
            })}
      />
    );
  };
  SafeIcon.displayName = `WebSafe${Icon.displayName ?? "Icon"}`;
  return SafeIcon as LucideIcon;
}

export const Accessibility = webSafe(AccessibilityBase);
export const AudioLines = webSafe(AudioLinesBase);
export const ArrowLeft = webSafe(ArrowLeftBase);
export const ArrowRight = webSafe(ArrowRightBase);
export const BadgeCheck = webSafe(BadgeCheckBase);
export const Bell = webSafe(BellBase);
export const BellRing = webSafe(BellRingBase);
export const BusFront = webSafe(BusFrontBase);
export const Captions = webSafe(CaptionsBase);
export const ChevronDown = webSafe(ChevronDownBase);
export const ChevronUp = webSafe(ChevronUpBase);
export const CheckCircle2 = webSafe(CheckCircle2Base);
export const Circle = webSafe(CircleBase);
export const CircleCheck = webSafe(CircleCheckBase);
export const CircleHelp = webSafe(CircleHelpBase, true);
export const CircleQuestionMark = webSafe(CircleQuestionMarkBase, true);
export const CircleX = webSafe(CircleXBase);
export const Clock = webSafe(ClockBase);
export const Compass = webSafe(CompassBase);
export const Contrast = webSafe(ContrastBase);
export const DoorOpen = webSafe(DoorOpenBase);
export const Ear = webSafe(EarBase);
export const Eye = webSafe(EyeBase);
export const Footprints = webSafe(FootprintsBase);
export const Gauge = webSafe(GaugeBase);
export const Languages = webSafe(LanguagesBase);
export const List = webSafe(ListBase);
export const LocateFixed = webSafe(LocateFixedBase);
export const Map = webSafe(MapBase);
export const MapPinned = webSafe(MapPinnedBase);
export const MapPin = webSafe(MapPinBase);
export const MapPinCheck = webSafe(MapPinCheckBase);
export const MessageSquareText = webSafe(MessageSquareTextBase);
export const Mountain = webSafe(MountainBase);
export const Moon = webSafe(MoonBase);
export const Navigation = webSafe(NavigationBase);
export const RefreshCw = webSafe(RefreshCwBase);
export const Route = webSafe(RouteBase);
export const ScanText = webSafe(ScanTextBase);
export const Search = webSafe(SearchBase);
export const Settings = webSafe(SettingsBase);
export const ShieldCheck = webSafe(ShieldCheckBase);
export const SlidersHorizontal = webSafe(SlidersHorizontalBase);
export const Sun = webSafe(SunBase);
export const Timer = webSafe(TimerBase);
export const Touchpad = webSafe(TouchpadBase);
export const Type = webSafe(TypeBase);
export const Undo2 = webSafe(Undo2Base);
export const User = webSafe(UserBase);
export const Vibrate = webSafe(VibrateBase);
export const Volume2 = webSafe(Volume2Base);
export const ArrowUp = webSafe(ArrowUpBase, true);
export const BookOpenCheck = webSafe(BookOpenCheckBase);
export const Bookmark = webSafe(BookmarkBase, true);
export const Camera = webSafe(CameraBase, true);
export const CameraOff = webSafe(CameraOffBase, true);
export const Check = webSafe(CheckBase);
export const CircleAlert = webSafe(CircleAlertBase);
export const ListChecks = webSafe(ListChecksBase);
export const Mic = webSafe(MicBase, true);
export const RotateCcw = webSafe(RotateCcwBase, true);
export const Send = webSafe(SendBase, true);
export const Share2 = webSafe(Share2Base, true);
export const ShieldAlert = webSafe(ShieldAlertBase);
export const Square = webSafe(SquareBase, true);
export const ThumbsDown = webSafe(ThumbsDownBase, true);
export const ThumbsUp = webSafe(ThumbsUpBase, true);
export const TriangleAlert = webSafe(TriangleAlertBase);
export const Umbrella = webSafe(UmbrellaBase);
export const X = webSafe(XBase, true);
