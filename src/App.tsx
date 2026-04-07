import React, { useState, useEffect } from "react";
import { BrowserRouter as Router, Routes, Route, Link, useLocation } from "react-router-dom";
import { 
  Search, 
  Star, 
  History, 
  Settings, 
  LayoutDashboard, 
  Globe, 
  Zap, 
  Bot, 
  FileCode, 
  Download, 
  Plus, 
  Bell, 
  User, 
  LogOut,
  ChevronRight,
  Loader2,
  AlertCircle,
  CheckCircle2,
  ExternalLink,
  Trash2,
  Play,
  Pause,
  Edit2,
  BarChart3,
  Moon,
  Sun,
  Eye,
  Clock,
  TrendingDown,
  TrendingUp,
  Minus,
  Copy
} from "lucide-react";
import { Button } from "./components/ui/button";
import { Input } from "./components/ui/input";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "./components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "./components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "./components/ui/table";
import { Badge } from "./components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "./components/ui/tabs";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "./components/ui/dialog";
import { Toaster, toast } from "sonner";
import { motion, AnimatePresence } from "motion/react";
import { ScrollArea } from "./components/ui/scroll-area";
import { Separator } from "./components/ui/separator";
import { Switch } from "./components/ui/switch";
import { Label } from "./components/ui/label";
import { Slider } from "./components/ui/slider";
import { supabase } from "./lib/supabase";
import { 
  LineChart, 
  Line, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer,
  AreaChart,
  Area
} from "recharts";

// --- Types ---

interface ScrapeResult {
  success: boolean;
  result: any;
  duration: number;
  error?: string;
}

interface MonitoredItem {
  id: string;
  url: string;
  title: string;
  price_current: number;
  price_previous: number;
  price_currency: string;
  status: "up" | "down" | "stable" | "out_of_stock";
  last_checked: string;
  is_active: boolean;
  price_selector?: string;
  custom_selectors?: string;
  threshold?: number;
  check_interval?: string;
  notification_channel?: "telegram" | "email" | "both";
  next_check?: string;
}

// --- Components ---

const Sidebar = ({ user, onLogout }: { user: any, onLogout: () => void }) => {
  const location = useLocation();
  const menuItems = [
    { icon: LayoutDashboard, label: "Dashboard", path: "/" },
    { icon: Star, label: "Favorites", path: "/favorites" },
    { icon: History, label: "History", path: "/history" },
    { icon: Settings, label: "Settings", path: "/settings" },
  ];

  return (
    <div className="w-64 border-r bg-card h-screen flex flex-col sticky top-0">
      <div className="p-6 flex items-center gap-3">
        <div className="w-10 h-10 bg-primary rounded-xl flex items-center justify-center text-primary-foreground shadow-lg shadow-primary/20">
          <Zap size={24} />
        </div>
        <div>
          <h1 className="font-bold text-lg leading-none">WebScraper</h1>
          <span className="text-xs text-muted-foreground font-medium">PRO EDITION</span>
        </div>
      </div>
      
      <nav className="flex-1 px-4 py-4 space-y-1">
        {menuItems.map((item) => {
          const isActive = location.pathname === item.path;
          return (
            <Link key={item.path} to={item.path}>
              <Button
                variant={isActive ? "secondary" : "ghost"}
                className={`w-full justify-start gap-3 h-11 px-4 transition-all ${isActive ? "bg-secondary font-semibold" : ""}`}
              >
                <item.icon size={18} className={isActive ? "text-primary" : "text-muted-foreground"} />
                {item.label}
                {isActive && <motion.div layoutId="active-pill" className="ml-auto w-1.5 h-1.5 rounded-full bg-primary" />}
              </Button>
            </Link>
          );
        })}
      </nav>

      <div className="p-4 mt-auto">
        <Card className="bg-secondary/50 border-none">
          <CardContent className="p-4 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-muted-foreground">FREE PLAN</span>
              <span className="text-xs font-bold">3/5</span>
            </div>
            <div className="h-1.5 w-full bg-muted rounded-full overflow-hidden">
              <div className="h-full bg-primary w-[60%]" />
            </div>
            <Button size="sm" className="w-full text-xs h-8">Upgrade to Pro</Button>
          </CardContent>
        </Card>
      </div>

      <div className="p-4 border-t flex items-center gap-3">
        <div className="w-9 h-9 rounded-full bg-muted flex items-center justify-center overflow-hidden border">
          <User size={20} className="text-muted-foreground" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold truncate">{user?.name || "User"}</p>
          <p className="text-xs text-muted-foreground truncate">{user?.email || "user@example.com"}</p>
        </div>
        <Button 
          variant="ghost" 
          size="icon" 
          className="text-muted-foreground hover:text-destructive"
          onClick={onLogout}
        >
          <LogOut size={18} />
        </Button>
      </div>
    </div>
  );
};

// --- Modals ---

const FullResultModal = ({ isOpen, onClose, result }: { isOpen: boolean, onClose: () => void, result: any }) => {
  const handleCopy = () => {
    const text = JSON.stringify(result, null, 2);
    navigator.clipboard.writeText(text);
    toast.success("Result copied to clipboard");
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-[90vw] w-full max-h-[90vh] flex flex-col">
        <DialogHeader className="flex flex-row items-center justify-between space-y-0">
          <div>
            <DialogTitle>Full Extraction Result</DialogTitle>
            <DialogDescription>
              Complete raw data from the extraction.
            </DialogDescription>
          </div>
          <Button variant="outline" size="sm" onClick={handleCopy} className="gap-2">
            <Copy size={14} /> Copy JSON
          </Button>
        </DialogHeader>
        <ScrollArea className="flex-1 bg-muted/50 rounded-md border mt-4">
          <div className="p-4">
            <pre className="text-xs font-mono whitespace-pre-wrap break-all">
              {JSON.stringify(result, null, 2)}
            </pre>
          </div>
        </ScrollArea>
        <DialogFooter className="mt-4">
          <Button onClick={onClose}>Close</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

const AddFavoriteModal = ({ isOpen, onClose, initialUrl, initialTitle }: { isOpen: boolean, onClose: () => void, initialUrl: string, initialTitle?: string }) => {
  const [name, setName] = useState(initialTitle || "");
  const [priceSelector, setPriceSelector] = useState("");
  const [customSelectors, setCustomSelectors] = useState("");
  const [threshold, setThreshold] = useState(10);
  const [interval, setInterval] = useState("1h");
  const [channel, setChannel] = useState<"telegram" | "email" | "both">("telegram");
  const [isSaving, setIsSaving] = useState(false);

  const handleSave = async () => {
    if (!name) return toast.error("Please enter a name");
    setIsSaving(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("User not found");

      const { error } = await supabase.from("monitored_items").insert({
        user_id: user.id,
        url: initialUrl,
        title: name,
        price_selector: priceSelector,
        custom_selectors: customSelectors,
        threshold,
        check_interval: interval,
        notification_channel: channel,
        is_active: true,
        price_current: 0,
        price_previous: 0,
        status: "stable",
        last_checked: new Date().toISOString(),
        next_check: new Date().toISOString()
      });

      if (error) throw error;
      toast.success("Item added to favorites!");
      onClose();
    } catch (error: any) {
      toast.error("Failed to add item: " + error.message);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Add to Favorites</DialogTitle>
          <DialogDescription>
            Configure monitoring for this URL.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label>Custom Name</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Product Name" />
          </div>
          <div className="space-y-2">
            <Label>Price Selector (CSS or XPath)</Label>
            <Input value={priceSelector} onChange={(e) => setPriceSelector(e.target.value)} placeholder=".price or //span[@class='price']" />
          </div>
          <div className="space-y-2">
            <Label>Alert Threshold ({threshold}%)</Label>
            <Slider value={[threshold]} onValueChange={(v) => setThreshold(v[0])} max={50} step={1} />
            <p className="text-[10px] text-muted-foreground">Notify if price drops more than {threshold}%</p>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Frequency</Label>
              <Select value={interval} onValueChange={setInterval}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="15m">15 mins</SelectItem>
                  <SelectItem value="1h">1 hour</SelectItem>
                  <SelectItem value="6h">6 hours</SelectItem>
                  <SelectItem value="1d">1 day</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Notification</Label>
              <Select value={channel} onValueChange={(v: any) => setChannel(v)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="telegram">Telegram</SelectItem>
                  <SelectItem value="email">Email</SelectItem>
                  <SelectItem value="both">Both</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={handleSave} disabled={isSaving}>
            {isSaving ? <Loader2 className="animate-spin" size={18} /> : "Save Item"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

const Dashboard = () => {
  const [url, setUrl] = useState("");
  const [method, setMethod] = useState("fetch-light");
  const [instruction, setInstruction] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [result, setResult] = useState<ScrapeResult | null>(null);
  const [isFavModalOpen, setIsFavModalOpen] = useState(false);
  const [isFullResultOpen, setIsFullResultOpen] = useState(false);

  const handleScrape = async () => {
    if (!url) return toast.error("Please enter a URL");
    
    let targetUrl = url.trim();
    if (!targetUrl.startsWith("http://") && !targetUrl.startsWith("https://")) {
      targetUrl = `https://${targetUrl}`;
      setUrl(targetUrl);
    }

    setIsLoading(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      
      if (!session) {
        toast.error("Your session has expired. Please log in again.");
        return;
      }

      const response = await fetch("/api/scrape", {
        method: "POST",
        headers: { 
          "Content-Type": "application/json",
          "Authorization": `Bearer ${session.access_token}`
        },
        body: JSON.stringify({ url: targetUrl, method, instruction }),
      });

      let data;
      const contentType = response.headers.get("content-type");
      if (contentType && contentType.includes("application/json")) {
        data = await response.json();
      } else {
        const text = await response.text();
        data = { success: false, error: text || `Server error: ${response.status}` };
      }

      setResult(data);
      if (data.success) {
        toast.success("Extraction successful!");
      } else {
        toast.error(`Scraper Error: ${data.error || "Unknown error"}`);
      }
    } catch (error: any) {
      console.error("Scrape Error:", error);
      toast.error(`Connection Error: ${error.message}`);
    } finally {
      setIsLoading(false);
    }
  };

  const handleExport = async (format: string) => {
    if (!result?.result) return;
    try {
      const response = await fetch("/api/export", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ data: result.result, format }),
      });
      const blob = await response.blob();
      const downloadUrl = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = downloadUrl;
      a.download = `extraction.${format}`;
      document.body.appendChild(a);
      a.click();
      a.remove();
    } catch (error) {
      toast.error("Export failed");
    }
  };

  return (
    <div className="p-8 space-y-8 max-w-6xl mx-auto">
      <header>
        <h2 className="text-3xl font-bold tracking-tight">Data Extractor</h2>
        <p className="text-muted-foreground">Professional web scraping with multiple engines.</p>
      </header>

      <Card className="border-2 shadow-xl shadow-primary/5">
        <CardContent className="p-6 space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-12 gap-4">
            <div className="md:col-span-8 space-y-2">
              <Label htmlFor="url">Target URL</Label>
              <div className="relative">
                <Globe className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" size={18} />
                <Input 
                  id="url"
                  placeholder="https://example.com/product" 
                  className="pl-10 h-12 text-base"
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                />
              </div>
            </div>
            <div className="md:col-span-4 space-y-2">
              <Label htmlFor="method">Engine</Label>
              <Select value={method} onValueChange={setMethod}>
                <SelectTrigger id="method" className="h-12">
                  <SelectValue placeholder="Select method" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="fetch-light">
                    <div className="flex items-center gap-2">
                      <Zap size={16} className="text-yellow-500" />
                      <span>Fetch Light</span>
                    </div>
                  </SelectItem>
                  <SelectItem value="cheerio">
                    <div className="flex items-center gap-2">
                      <FileCode size={16} className="text-blue-500" />
                      <span>Cheerio Parser</span>
                    </div>
                  </SelectItem>
                  <SelectItem value="gemini-ai">
                    <div className="flex items-center gap-2">
                      <Bot size={16} className="text-purple-500" />
                      <span>Gemini AI</span>
                    </div>
                  </SelectItem>
                  <SelectItem value="playwright">
                    <div className="flex items-center gap-2">
                      <Play size={16} className="text-orange-500" />
                      <span>Playwright (JS)</span>
                    </div>
                  </SelectItem>
                  <SelectItem value="importxml">
                    <div className="flex items-center gap-2">
                      < Globe size={16} className="text-green-500" />
                      <span>ImportXML (XPath)</span>
                    </div>
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <AnimatePresence>
            {method === "gemini-ai" && (
              <motion.div 
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: "auto", opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                className="space-y-2 overflow-hidden"
              >
                <Label htmlFor="instruction">AI Instructions</Label>
                <Input 
                  id="instruction"
                  placeholder="Extract all product names and prices in a list..." 
                  value={instruction}
                  onChange={(e) => setInstruction(e.target.value)}
                  className="h-12"
                />
              </motion.div>
            )}
          </AnimatePresence>

          <Button 
            className="w-full h-12 text-lg font-semibold shadow-lg shadow-primary/20" 
            onClick={handleScrape}
            disabled={isLoading}
          >
            {isLoading ? (
              <>
                <Loader2 className="mr-2 animate-spin" size={20} />
                Extracting Data...
              </>
            ) : (
              <>
                <Search className="mr-2" size={20} />
                Run Extraction
              </>
            )}
          </Button>
        </CardContent>
      </Card>

      {result && (
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="space-y-6"
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <h3 className="text-xl font-bold">Results</h3>
              <Badge variant="secondary" className="gap-1">
                <History size={12} />
                {result.duration}ms
              </Badge>
            </div>
            <div className="flex items-center gap-2">
              {result.success && (
                <Button variant="outline" size="sm" className="gap-2 text-yellow-500 border-yellow-500/50 hover:bg-yellow-500/10" onClick={() => setIsFavModalOpen(true)}>
                  <Star size={14} /> Monitor Item
                </Button>
              )}
              <Button variant="outline" size="sm" className="gap-2" onClick={() => handleExport("json")}>
                <Download size={14} /> JSON
              </Button>
              <Button variant="outline" size="sm" className="gap-2" onClick={() => handleExport("csv")}>
                <Download size={14} /> CSV
              </Button>
              <Button variant="outline" size="sm" className="gap-2" onClick={() => handleExport("xml")}>
                <Download size={14} /> XML
              </Button>
            </div>
          </div>

          <Card>
            <ScrollArea className="h-[400px]">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Field</TableHead>
                    <TableHead>Value</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {result.success ? (
                    Object.entries(result.result).map(([key, value]: [string, any]) => (
                      <TableRow key={key} className="cursor-pointer hover:bg-muted/50" onClick={() => setIsFullResultOpen(true)}>
                        <TableCell className="font-medium text-primary">{key}</TableCell>
                        <TableCell className="max-w-md truncate">
                          {typeof value === "object" ? JSON.stringify(value) : String(value)}
                        </TableCell>
                      </TableRow>
                    ))
                  ) : (
                    <TableRow>
                      <TableCell colSpan={2} className="text-center py-12 text-destructive">
                        <AlertCircle className="mx-auto mb-2" size={32} />
                        <p className="font-semibold">Error: {result.error}</p>
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </ScrollArea>
          </Card>
        </motion.div>
      )}

      <AddFavoriteModal 
        isOpen={isFavModalOpen} 
        onClose={() => setIsFavModalOpen(false)} 
        initialUrl={url}
        initialTitle={result?.result?.title || result?.result?.name}
      />

      <FullResultModal 
        isOpen={isFullResultOpen} 
        onClose={() => setIsFullResultOpen(false)} 
        result={result?.result}
      />
    </div>
  );
};

const Favorites = () => {
  const [items, setItems] = useState<MonitoredItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isChecking, setIsChecking] = useState<string | null>(null);

  const fetchItems = async () => {
    const { data, error } = await supabase
      .from("monitored_items")
      .select("*")
      .order("created_at", { ascending: false });
    
    if (error) {
      toast.error("Failed to fetch monitored items");
    } else {
      setItems(data || []);
    }
    setIsLoading(false);
  };

  useEffect(() => {
    fetchItems();
  }, []);

  const handleToggleActive = async (id: string, currentStatus: boolean) => {
    const { error } = await supabase
      .from("monitored_items")
      .update({ is_active: !currentStatus })
      .eq("id", id);
    
    if (error) toast.error("Failed to update status");
    else {
      toast.success(currentStatus ? "Monitoring paused" : "Monitoring resumed");
      fetchItems();
    }
  };

  const handleDelete = async (id: string) => {
    const { error } = await supabase
      .from("monitored_items")
      .delete()
      .eq("id", id);
    
    if (error) toast.error("Failed to delete item");
    else {
      toast.success("Item removed from favorites");
      fetchItems();
    }
  };

  const handleCheckNow = async (id: string) => {
    setIsChecking(id);
    try {
      // In a real app, this would call a backend function that performs the scrape
      // For now, we'll simulate it or just refresh the list
      await new Promise(resolve => setTimeout(resolve, 2000));
      toast.success("Check completed!");
      fetchItems();
    } catch (error) {
      toast.error("Check failed");
    } finally {
      setIsChecking(null);
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "down": return <Badge className="bg-green-500 hover:bg-green-600 gap-1"><TrendingDown size={10} /> Price dropped!</Badge>;
      case "up": return <Badge variant="destructive" className="gap-1"><TrendingUp size={10} /> Price rose</Badge>;
      case "out_of_stock": return <Badge variant="outline" className="text-orange-500 border-orange-500 gap-1"><AlertCircle size={10} /> Out of stock</Badge>;
      default: return <Badge variant="secondary" className="gap-1"><Minus size={10} /> No changes</Badge>;
    }
  };

  return (
    <div className="p-8 space-y-8 max-w-6xl mx-auto">
      <header className="flex items-center justify-between">
        <div>
          <h2 className="text-3xl font-bold tracking-tight">Monitored Items</h2>
          <p className="text-muted-foreground">Real-time price tracking and alerts.</p>
        </div>
        <Button className="gap-2" onClick={() => window.location.href = "/"}>
          <Plus size={18} /> Add New Item
        </Button>
      </header>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {isLoading ? (
          Array(3).fill(0).map((_, i) => (
            <Card key={i} className="h-64 animate-pulse bg-muted/50" />
          ))
        ) : items.length > 0 ? (
          items.map((item) => {
            const priceDiff = item.price_previous - item.price_current;
            const priceDiffPct = item.price_previous > 0 ? ((priceDiff / item.price_previous) * 100).toFixed(1) : 0;

            return (
              <Card key={item.id} className={`overflow-hidden border-2 transition-all group ${item.is_active ? "hover:border-primary/50" : "opacity-70 grayscale-[0.5]"}`}>
                <CardHeader className="p-4 pb-2">
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex gap-2">
                      <Badge variant={item.is_active ? "default" : "secondary"} className="text-[10px] h-5">
                        {item.is_active ? "ACTIVE" : "PAUSED"}
                      </Badge>
                      {item.is_active && getStatusBadge(item.status)}
                    </div>
                    <div className="flex items-center gap-1">
                      <Button 
                        variant="ghost" 
                        size="icon" 
                        className="h-8 w-8 text-destructive opacity-0 group-hover:opacity-100 transition-opacity"
                        onClick={() => handleDelete(item.id)}
                      >
                        <Trash2 size={14} />
                      </Button>
                    </div>
                  </div>
                  <CardTitle className="text-lg truncate">{item.title}</CardTitle>
                  <CardDescription className="truncate text-xs flex items-center gap-1">
                    <Globe size={10} /> {item.url}
                  </CardDescription>
                </CardHeader>
                <CardContent className="p-4 pt-0 space-y-4">
                  <div className="flex items-end justify-between">
                    <div>
                      <p className="text-xs text-muted-foreground font-medium">CURRENT PRICE</p>
                      <div className="flex items-center gap-2">
                        <span className="text-2xl font-bold">{item.price_currency || "€"}{item.price_current}</span>
                        {item.status === "down" && (
                          <span className="text-xs font-bold text-green-500">-{priceDiffPct}%</span>
                        )}
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="text-[10px] text-muted-foreground font-medium uppercase">PREVIOUS</p>
                      <p className="text-sm line-through text-muted-foreground">{item.price_currency || "€"}{item.price_previous}</p>
                    </div>
                  </div>

                  <div className="space-y-1">
                    <div className="flex items-center justify-between text-[10px]">
                      <span className="text-muted-foreground flex items-center gap-1"><Clock size={10} /> Interval: {item.check_interval}</span>
                      <span className="text-muted-foreground flex items-center gap-1"><Bell size={10} /> {item.notification_channel}</span>
                    </div>
                  </div>
                </CardContent>
                <CardFooter className="p-4 pt-0 border-t bg-muted/30 flex items-center justify-between">
                  <span className="text-[10px] text-muted-foreground">Checked {item.last_checked ? new Date(item.last_checked).toLocaleString() : "Never"}</span>
                  <div className="flex gap-2">
                    <Button 
                      variant="ghost" 
                      size="sm" 
                      className="h-7 text-[10px] gap-1 px-2"
                      onClick={() => handleToggleActive(item.id, item.is_active)}
                    >
                      {item.is_active ? <Pause size={10} /> : <Play size={10} />}
                      {item.is_active ? "Pause" : "Resume"}
                    </Button>
                    <Button 
                      variant="ghost" 
                      size="sm" 
                      className="h-7 text-[10px] gap-1 px-2"
                      onClick={() => handleCheckNow(item.id)}
                      disabled={isChecking === item.id || !item.is_active}
                    >
                      {isChecking === item.id ? <Loader2 className="animate-spin" size={10} /> : <Search size={10} />}
                      Check Now
                    </Button>
                  </div>
                </CardFooter>
              </Card>
            );
          })
        ) : (
          <div className="col-span-full py-20 text-center border-2 border-dashed rounded-xl bg-muted/20">
            <Star className="mx-auto mb-4 text-muted-foreground/50" size={48} />
            <h3 className="text-xl font-semibold">No items monitored</h3>
            <p className="text-muted-foreground">Add items from the dashboard to start tracking prices.</p>
            <Button variant="outline" className="mt-6" onClick={() => window.location.href = "/"}>
              Go to Dashboard
            </Button>
          </div>
        )}
      </div>
    </div>
  );
};

const HistoryPage = () => {
  const [jobs, setJobs] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedJob, setSelectedJob] = useState<any | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);

  useEffect(() => {
    const fetchJobs = async () => {
      const { data, error } = await supabase
        .from("scrape_jobs")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(50);
      
      if (error) toast.error("Failed to fetch history");
      else setJobs(data || []);
      setIsLoading(false);
    };
    fetchJobs();
  }, []);

  return (
    <div className="p-8 space-y-8 max-w-6xl mx-auto">
      <header>
        <h2 className="text-3xl font-bold tracking-tight">Scrape History</h2>
        <p className="text-muted-foreground">Review your past extraction tasks and results.</p>
      </header>

      <Card>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Date</TableHead>
              <TableHead>URL</TableHead>
              <TableHead>Engine</TableHead>
              <TableHead>Duration</TableHead>
              <TableHead className="text-right">Action</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              Array(5).fill(0).map((_, i) => (
                <TableRow key={i} className="animate-pulse">
                  <TableCell colSpan={5} className="h-12 bg-muted/20" />
                </TableRow>
              ))
            ) : jobs.length > 0 ? (
              jobs.map((job) => (
                <TableRow key={job.id}>
                  <TableCell className="text-xs text-muted-foreground">
                    {new Date(job.created_at).toLocaleString()}
                  </TableCell>
                  <TableCell className="max-w-xs truncate font-medium">
                    <div className="flex items-center gap-2">
                      <span className="truncate">{job.url}</span>
                      <Button 
                        variant="ghost" 
                        size="icon" 
                        className="h-6 w-6 shrink-0" 
                        onClick={() => {
                          navigator.clipboard.writeText(job.url);
                          toast.success("URL copied to clipboard");
                        }}
                      >
                        <Copy size={12} />
                      </Button>
                    </div>
                  </TableCell>
                  <TableCell>
                    <Badge variant="secondary" className="text-[10px]">
                      {job.method}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-xs">
                    {job.duration}ms
                  </TableCell>
                  <TableCell className="text-right">
                    <Button variant="ghost" size="sm" onClick={() => {
                      setSelectedJob(job);
                      setIsModalOpen(true);
                    }}>
                      <Eye size={14} />
                    </Button>
                  </TableCell>
                </TableRow>
              ))
            ) : (
              <TableRow>
                <TableCell colSpan={5} className="text-center py-12 text-muted-foreground">
                  No history found.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </Card>

      <FullResultModal 
        isOpen={isModalOpen} 
        onClose={() => setIsModalOpen(false)} 
        result={selectedJob?.result} 
      />
    </div>
  );
};

const SettingsPage = () => {
  const [chatId, setChatId] = useState("");
  const [isTesting, setIsTesting] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    const fetchProfile = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data, error } = await supabase
        .from("profiles")
        .select("telegram_chat_id")
        .eq("id", user.id)
        .single();
      
      if (data) setChatId(data.telegram_chat_id || "");
    };
    fetchProfile();
  }, []);

  const handleSave = async () => {
    setIsSaving(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      const { error } = await supabase
        .from("profiles")
        .upsert({ id: user.id, telegram_chat_id: chatId });
      
      if (error) throw error;
      toast.success("Settings saved successfully");
    } catch (error: any) {
      toast.error("Failed to save settings: " + error.message);
    } finally {
      setIsSaving(false);
    }
  };

  const handleTestTelegram = async () => {
    if (!chatId) return toast.error("Please enter a Chat ID");
    setIsTesting(true);
    try {
      const response = await fetch("/api/notifications/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ chatId }),
      });
      const data: any = await response.json();
      if (data.success) toast.success("Test message sent!");
      else toast.error("Test failed: " + data.error);
    } catch (error) {
      toast.error("An error occurred during testing");
    } finally {
      setIsTesting(false);
    }
  };

  return (
    <div className="p-8 space-y-8 max-w-4xl mx-auto">
      <header>
        <h2 className="text-3xl font-bold tracking-tight">Settings</h2>
        <p className="text-muted-foreground">Manage your account and notification preferences.</p>
      </header>

      <div className="grid gap-6">
        <Card>
          <CardHeader>
            <CardTitle>Notifications</CardTitle>
            <CardDescription>How you want to be alerted about price changes.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label className="text-base">Telegram Alerts</Label>
                <p className="text-sm text-muted-foreground">Receive instant alerts via our Telegram bot.</p>
              </div>
              <Switch defaultChecked />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Telegram Configuration</CardTitle>
            <CardDescription>Connect your Telegram account to start receiving alerts.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="chatId">Chat ID</Label>
              <div className="flex gap-2">
                <Input 
                  id="chatId" 
                  placeholder="e.g. 123456789" 
                  className="flex-1" 
                  value={chatId}
                  onChange={(e) => setChatId(e.target.value)}
                />
                <Button 
                  variant="secondary" 
                  onClick={handleTestTelegram}
                  disabled={isTesting}
                >
                  {isTesting ? <Loader2 className="animate-spin" size={18} /> : "Test Connection"}
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                Message <span className="font-mono font-bold">@KalboScraperBot</span> to get your Chat ID.
              </p>
            </div>
          </CardContent>
          <CardFooter className="border-t pt-4">
            <Button onClick={handleSave} disabled={isSaving}>
              {isSaving && <Loader2 className="animate-spin mr-2" size={16} />}
              Save Configuration
            </Button>
          </CardFooter>
        </Card>

        <Card className="border-destructive/20">
          <CardHeader>
            <CardTitle className="text-destructive">Danger Zone</CardTitle>
            <CardDescription>Irreversible actions for your account.</CardDescription>
          </CardHeader>
          <CardContent>
            <Button variant="destructive">Delete Account</Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

const LoginPage = ({ onLogin }: { onLogin: (user: any) => void }) => {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isSignUp, setIsSignUp] = useState(false);

  const handleAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    try {
      if (isSignUp) {
        const { data, error } = await supabase.auth.signUp({
          email,
          password,
        });
        if (error) throw error;
        toast.success("Check your email for the confirmation link!");
      } else {
        const { data, error } = await supabase.auth.signInWithPassword({
          email,
          password,
        });
        if (error) throw error;
        onLogin(data.user);
        toast.success("Welcome back!");
      }
    } catch (error: any) {
      toast.error(error.message || "Authentication failed");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-muted/30 p-4">
      <motion.div 
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className="w-full max-w-md"
      >
        <Card className="border-2 shadow-2xl">
          <CardHeader className="space-y-1 text-center">
            <div className="mx-auto w-12 h-12 bg-primary rounded-xl flex items-center justify-center text-primary-foreground mb-4">
              <Zap size={28} />
            </div>
            <CardTitle className="text-2xl">WebScraper Pro</CardTitle>
            <CardDescription>
              {isSignUp ? "Create an account to get started" : "Enter your credentials to access your dashboard"}
            </CardDescription>
          </CardHeader>
          <form onSubmit={handleAuth}>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input 
                  id="email" 
                  type="email" 
                  placeholder="name@example.com" 
                  required 
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label htmlFor="password">Password</Label>
                  {!isSignUp && <Button variant="link" className="px-0 h-auto text-xs">Forgot password?</Button>}
                </div>
                <Input 
                  id="password" 
                  type="password" 
                  required 
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
              </div>
            </CardContent>
            <CardFooter>
              <Button type="submit" className="w-full h-11" disabled={isLoading}>
                {isLoading ? <Loader2 className="animate-spin mr-2" size={18} /> : (isSignUp ? "Create Account" : "Sign In")}
              </Button>
            </CardFooter>
          </form>
        </Card>
        <p className="text-center mt-6 text-sm text-muted-foreground">
          {isSignUp ? "Already have an account?" : "Don't have an account?"}{" "}
          <Button variant="link" className="p-0 h-auto" onClick={() => setIsSignUp(!isSignUp)}>
            {isSignUp ? "Sign In" : "Create one"}
          </Button>
        </p>
      </motion.div>
    </div>
  );
};

const Layout = ({ children, user, onLogout }: { children: React.ReactNode, user: any, onLogout: () => void }) => {
  return (
    <div className="flex min-h-screen bg-background">
      <Sidebar user={user} onLogout={onLogout} />
      <main className="flex-1 overflow-y-auto">
        {children}
      </main>
      <Toaster position="top-right" closeButton richColors />
    </div>
  );
};

export default function App() {
  const [user, setUser] = useState<any>(null);
  const [isAuthReady, setIsAuthReady] = useState(false);

  useEffect(() => {
    if (!(import.meta as any).env.VITE_SUPABASE_URL || !(import.meta as any).env.VITE_SUPABASE_ANON_KEY) {
      toast.error("Supabase configuration is missing. Please add VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY to your environment variables.", {
        duration: 10000,
      });
    }

    // Check active sessions and sets the user
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null);
      setIsAuthReady(true);
    });

    // Listen for changes on auth state (logged in, signed out, etc.)
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
    });

    return () => subscription.unsubscribe();
  }, []);

  const handleLogout = async () => {
    await supabase.auth.signOut();
    toast.info("Logged out successfully");
  };

  if (!isAuthReady) return null;

  if (!user) {
    return (
      <>
        <LoginPage onLogin={setUser} />
        <Toaster position="top-right" closeButton richColors />
      </>
    );
  }

  return (
    <Router>
      <Layout user={user} onLogout={handleLogout}>
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/favorites" element={<Favorites />} />
          <Route path="/history" element={<HistoryPage />} />
          <Route path="/settings" element={<SettingsPage />} />
        </Routes>
      </Layout>
    </Router>
  );
}
